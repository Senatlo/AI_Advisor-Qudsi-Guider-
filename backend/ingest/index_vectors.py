"""Build local BGE-M3 vectors from the authoritative SQLite catalog and policies.

Run: python -m backend.ingest.index_vectors
Only normalized, allowlisted fields are embedded; raw CSV JSON and demo schedules
never enter this index. Completed batches can be reused after an interrupted run.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.config import EXCLUDED_NON_POLICY_DOCUMENTS, Settings, get_settings
from backend.rag.ollama_client import LocalOllamaClient
from backend.rag.retriever import HybridRAGService

COLLECTION_NAME = "alquds_catalog_and_policy"
INDEX_VERSION = "catalog-policy-v1"


def load_documents(settings: Settings) -> list[dict[str, Any]]:
    """Use the same catalog text and citation metadata as live retrieval."""
    if not Path(settings.sqlite_db_path).is_file():
        raise ValueError("Import the academic dataset before building vectors.")
    conn = sqlite3.connect(f"{Path(settings.sqlite_db_path).resolve().as_uri()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    rag = HybridRAGService(settings=settings)
    documents = []
    try:
        conn.execute("BEGIN")
        cur = conn.cursor()
        for row in cur.execute("SELECT * FROM courses_master_official ORDER BY row_id").fetchall():
            documents.append(rag._row_to_passage(cur, row, score=0, match_reason="indexed_catalog"))
        excluded = {name.casefold() for name in EXCLUDED_NON_POLICY_DOCUMENTS}
        for row in cur.execute("SELECT * FROM policy_chunks ORDER BY chunk_id").fetchall():
            if any(name in row["doc_title"].casefold() for name in excluded):
                continue
            if not row["source_url"] or not row["text_original"].strip():
                continue
            documents.append({
                "chunk_id": row["chunk_id"], "chunk_type": "policy_chunk",
                "course_number": "", "program_id": "", "title_ar": row["doc_title"],
                "title_en": row["doc_title"], "text": row["text_original"],
                "source_url": row["source_url"], "last_verified_at": "",
                "effective_policy_date": row["effective_policy_date"] or "",
                "page_number": row["page_number"], "has_conflict": False, "has_gap": False,
            })
    finally:
        conn.close()
    ids = [doc["chunk_id"] for doc in documents]
    if len(ids) != len(set(ids)):
        raise ValueError("Catalog and policy chunk IDs must be unique.")
    if not documents:
        raise ValueError("No approved catalog or policy documents are available to index.")
    return documents


def record_for(document: dict[str, Any], model_digest: str) -> dict[str, Any]:
    keys = ("chunk_type", "course_number", "program_id", "title_ar", "title_en",
            "credit_hours", "source_url", "last_verified_at", "effective_policy_date",
            "page_number", "has_conflict", "has_gap")
    metadata = {key: document[key] for key in keys if document.get(key) is not None}
    content = json.dumps([INDEX_VERSION, model_digest, document["text"], metadata],
                         ensure_ascii=False, sort_keys=True)
    metadata["content_hash"] = hashlib.sha256(content.encode("utf-8")).hexdigest()
    return {"id": document["chunk_id"], "text": document["text"], "metadata": metadata}


def sync_records(collection: Any, records: list[dict[str, Any]], ollama: Any,
                 batch_size: int = 16) -> dict[str, int]:
    """Upsert changed records; prune obsolete IDs only after every batch succeeds."""
    if batch_size < 1:
        raise ValueError("batch_size must be positive")
    existing = collection.get(include=["metadatas"])
    hashes = {cid: (meta or {}).get("content_hash") for cid, meta in
              zip(existing["ids"], existing["metadatas"])}
    pending = [record for record in records
               if hashes.get(record["id"]) != record["metadata"]["content_hash"]]
    indexed = 0
    for offset in range(0, len(pending), batch_size):
        batch = pending[offset:offset + batch_size]
        embeddings = ollama.embed_texts([record["text"] for record in batch])
        if len(embeddings) != len(batch) or any(
            not vector or not all(math.isfinite(value) for value in vector)
            for vector in embeddings
        ):
            raise ValueError("Ollama returned missing or invalid embedding vectors.")
        collection.upsert(ids=[r["id"] for r in batch], documents=[r["text"] for r in batch],
                          metadatas=[r["metadata"] for r in batch], embeddings=embeddings)
        indexed += len(batch)
        print(json.dumps({"embedded": indexed, "pending_total": len(pending),
                          "unchanged": len(records) - len(pending)}), flush=True)
    wanted = {record["id"] for record in records}
    stale = sorted(set(existing["ids"]) - wanted)
    for offset in range(0, len(stale), batch_size):
        collection.delete(ids=stale[offset:offset + batch_size])
    if collection.count() != len(records):
        raise RuntimeError("Vector count does not match the approved source snapshot.")
    return {"vector_count": collection.count(), "embedded": indexed,
            "unchanged": len(records) - len(pending), "removed": len(stale)}


def build_index(settings: Settings, batch_size: int = 16) -> dict[str, Any]:
    import chromadb

    documents = load_documents(settings)
    ollama = LocalOllamaClient(settings)
    tags = ollama._request_json("GET", "/api/tags")
    candidates = {settings.ollama_embed_model, f"{settings.ollama_embed_model}:latest"}
    model = next((m for m in tags.get("models", []) if m.get("name") in candidates), None)
    if not model or not model.get("digest"):
        raise ValueError(f"Install the configured embedding model: {settings.ollama_embed_model}")
    digest = model["digest"]
    client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
    collection = client.get_or_create_collection(name=COLLECTION_NAME, embedding_function=None)
    previous = collection.metadata or {}
    if collection.count() and previous.get("embedding_model_digest") != digest:
        raise ValueError("Embedding model differs from the existing index. Use a new CHROMA_PERSIST_DIR.")
    collection.modify(metadata={**previous, "embedding_model": settings.ollama_embed_model,
                                "embedding_model_digest": digest, "index_version": INDEX_VERSION})
    result = sync_records(collection, [record_for(doc, digest) for doc in documents], ollama, batch_size)
    report = {**result, "embedding_model": settings.ollama_embed_model,
              "embedding_model_digest": digest, "index_version": INDEX_VERSION,
              "catalog_rows": sum(d["chunk_type"] == "catalog_row" for d in documents),
              "policy_chunks": sum(d["chunk_type"] == "policy_chunk" for d in documents),
              "completed_at": datetime.now(timezone.utc).isoformat()}
    Path(settings.chroma_persist_dir, "index-report.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    from dotenv import load_dotenv

    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch-size", type=int, default=16)
    args = parser.parse_args()
    print(json.dumps(build_index(get_settings(), args.batch_size), indent=2), flush=True)


if __name__ == "__main__":
    main()
