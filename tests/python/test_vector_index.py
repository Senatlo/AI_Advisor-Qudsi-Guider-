"""Vector indexing regressions using real local Chroma and deterministic test embeddings."""

import json
import sqlite3
import tempfile
import unittest
import zipfile
from dataclasses import replace
from pathlib import Path

import chromadb

from backend.config import get_settings
from backend.ingest.importer import DatasetIngestor
from backend.ingest.index_vectors import load_documents, record_for, sync_records
from backend.rag.retriever import HybridRAGService


class TestEmbeddings:
    def __init__(self):
        self.calls = 0

    def embed_texts(self, texts):
        self.calls += 1
        return [[1.0, 0.5, 0.25] for _ in texts]


class TestVectorIndex(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        root = Path(self.tmp.name)
        self.settings = replace(get_settings(), sqlite_db_path=str(root / "catalog.db"),
                                chroma_persist_dir=str(root / "chroma"))
        archive = root / "catalog.zip"
        with zipfile.ZipFile(archive, "w") as z:
            z.writestr("courses_master_official_only.csv",
                "master_row_id,course_number,program_code,course_name_en,credit_hours,course_source_url,prerequisites_en,instructor_name_en\n"
                "official-A,0302102,CS,Data Structures,3,https://www.alquds.edu/catalog,0302101,FAKE_INSTRUCTOR\n"
                "official-B,0302102,ENG,Data Structures,4,https://www.alquds.edu/engineering,,FAKE_INSTRUCTOR\n")
            z.writestr("sections.csv", "course_number,title\n0302102,FAKE_SECTION\n")
        DatasetIngestor(self.settings.sqlite_db_path).ingest_from_zip_or_dir(str(archive))
        self.collection = chromadb.PersistentClient(path=self.settings.chroma_persist_dir).get_or_create_collection(
            "alquds_catalog_and_policy", embedding_function=None)

    def tearDown(self):
        self.tmp.cleanup()

    def test_real_csv_columns_provenance_and_synthetic_exclusions(self):
        documents = load_documents(self.settings)
        self.assertEqual({d["chunk_id"] for d in documents}, {"official-A", "official-B"})
        self.assertEqual({d["program_id"] for d in documents}, {"CS", "ENG"})
        self.assertTrue(all(d["title_en"] == "Data Structures" for d in documents))
        self.assertTrue(all(d["source_url"].startswith("https://www.alquds.edu/") for d in documents))
        self.assertIn("0302101", documents[0]["text"])
        self.assertNotIn("FAKE_", json.dumps(documents))

    def add_catalog_reference(self, row_id, program, title, raw_rule=""):
        with sqlite3.connect(self.settings.sqlite_db_path) as conn:
            conn.execute("""INSERT INTO courses_master_official
                (row_id,course_number,program_id,title_en,credit_hours,source_url,
                 raw_prerequisite_text,normalized_search_text)
                VALUES (?, '0302101', ?, ?, 3, 'https://www.alquds.edu/prerequisite', ?, ?)""",
                (row_id, program, title, raw_rule, title.lower()))

    def test_prerequisite_lookup_adds_name_and_citation_within_budget(self):
        self.add_catalog_reference("cs-prerequisite", "CS", "Programming Fundamentals", "0302102")
        self.add_catalog_reference("eng-prerequisite", "ENG", "Different Program Title")
        rag = HybridRAGService(settings=self.settings, ollama_client=TestEmbeddings())
        result = rag.retrieve("what is the prerequisite for data structure", program_id="CS", top_k=2)
        self.assertFalse(result["refusal"])
        self.assertEqual([p["chunk_id"] for p in result["passages"]], ["official-A", "cs-prerequisite"])
        reference = result["passages"][1]
        self.assertEqual(reference["title_en"], "Programming Fundamentals")
        self.assertEqual(reference["match_reason"], "referenced_course_lookup")
        self.assertEqual(reference["source_url"], "https://www.alquds.edu/prerequisite")
        # The prerequisite points back to the target; lookup must remain one hop.
        self.assertEqual(len(result["passages"]), 2)

    def test_prerequisite_name_does_not_come_from_another_program(self):
        self.add_catalog_reference("eng-only", "ENG", "Wrong Program Name")
        rag = HybridRAGService(settings=self.settings, ollama_client=TestEmbeddings())
        result = rag.retrieve("data structure", program_id="CS")
        self.assertTrue(all(p["chunk_id"] != "eng-only" for p in result["passages"]))
        self.assertIn("catalog name unavailable in this program", result["passages"][0]["text"])

    def test_repeated_build_skips_unchanged_and_updates_changed_rows(self):
        records = [record_for(doc, "model-digest") for doc in load_documents(self.settings)]
        embeddings = TestEmbeddings()
        self.assertEqual(sync_records(self.collection, records, embeddings)["embedded"], 2)
        self.assertEqual(sync_records(self.collection, records, embeddings)["embedded"], 0)
        self.assertEqual(embeddings.calls, 1)
        changed = load_documents(self.settings)[0]
        changed["text"] += " Updated official description."
        records[0] = record_for(changed, "model-digest")
        self.assertEqual(sync_records(self.collection, records, embeddings)["embedded"], 1)
        result = self.collection.query(query_embeddings=[[1.0, 0.5, 0.25]],
                                       where={"program_id": "CS"}, n_results=1)
        self.assertEqual(result["ids"][0], ["official-A"])
        self.assertEqual(result["metadatas"][0][0]["course_number"], "0302102")

    def test_failed_embedding_does_not_prune_existing_records(self):
        records = [record_for(doc, "model-digest") for doc in load_documents(self.settings)]
        sync_records(self.collection, records, TestEmbeddings())
        changed = dict(records[0])
        changed["metadata"] = {**changed["metadata"], "content_hash": "changed"}
        class BrokenEmbeddings:
            def embed_texts(self, texts):
                return []
        with self.assertRaises(ValueError):
            sync_records(self.collection, [changed], BrokenEmbeddings())
        self.assertEqual(self.collection.count(), 2)
        result = sync_records(self.collection, [records[0]], TestEmbeddings())
        self.assertEqual(result["removed"], 1)
        self.assertEqual(self.collection.count(), 1)

    def test_semantic_neighbors_must_pass_relevance_distance(self):
        records = [record_for(doc, "model-digest") for doc in load_documents(self.settings)]
        sync_records(self.collection, records, TestEmbeddings())
        rag = HybridRAGService(settings=self.settings, ollama_client=TestEmbeddings())
        hits = {}
        rag._merge_chroma_results("relevant question", None, hits)
        self.assertEqual(len(hits), 2)
        class DistantEmbeddings:
            def embed_texts(self, texts):
                return [[0.0, 0.0, 0.0] for _ in texts]
        rag.ollama = DistantEmbeddings()
        hits = {}
        rag._merge_chroma_results("unsupported question", None, hits)
        self.assertEqual(hits, {})

    def test_fee_questions_require_policy_evidence_even_with_matching_course(self):
        rag = HybridRAGService(settings=self.settings, ollama_client=TestEmbeddings())
        for query in ["What are the tuition fees for course 0302102?", "ما هي رسوم المساق 0302102؟"]:
            result = rag.retrieve(query)
            self.assertTrue(result["refusal"])
            self.assertEqual(result["refusal_type"], "insufficient_evidence")


if __name__ == "__main__":
    unittest.main()
