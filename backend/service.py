"""Core application service handlers for Al-Quds AI Academic Advisor.

Provides the concrete business logic behind:
- GET /api/health
- GET /api/programs
- GET /api/courses
- GET /api/courses/{course_number}
- POST /api/chat
- POST /api/planner/evaluate
- GET /api/knowledge/status
- GET /api/portal/status
- GET /api/evidence
"""

from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional

from backend.config import (
    EXCLUDED_NON_POLICY_DOCUMENTS,
    EXCLUDED_SYNTHETIC_FILES,
    EXPECTED_DATASET_DIAGNOSTICS,
    Settings,
    get_settings,
)
from backend.ingest.arabic_utils import normalize_arabic_for_search, preserve_course_number
from backend.ingest.schema import init_db
from backend.planner.engine import DeterministicPlannerEngine
from backend.portals.adapters import PortalSessionManager
from backend.rag.benchmark import BENCHMARK_CASES
from backend.rag.ollama_client import LocalOllamaClient
from backend.rag.retriever import HybridRAGService


class AdvisorBackendService:
    """Unified backend service orchestrating SQLite, ChromaDB, Ollama, Planner, and Portals."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self.ollama = LocalOllamaClient(self.settings)
        self.rag = HybridRAGService(
            sqlite_path=self.settings.sqlite_db_path,
            chroma_dir=self.settings.chroma_persist_dir,
            ollama_client=self.ollama,
            settings=self.settings,
        )
        self.planner = DeterministicPlannerEngine(sqlite_path=self.settings.sqlite_db_path)
        self.portals = PortalSessionManager(self.settings)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.settings.sqlite_db_path)
        conn.row_factory = sqlite3.Row
        init_db(conn)
        return conn

    def get_health(self) -> Dict[str, Any]:
        idx = self.rag.get_index_status()
        ollama_state = self.ollama.inspect_readiness()
        return {
            "status": "ok",
            "service": "alquds-ai-academic-advisor-backend",
            "institution_scope": "Al-Quds University Only (Independent Student Project)",
            "backend_connected": True,
            "sqlite_ready": idx.get("sqlite_ready", False),
            "dataset_loaded": idx.get("dataset_loaded", False),
            "ollama": ollama_state,
            "portal_sync": "unsupported_pending_verification",
        }

    def get_knowledge_status(self) -> Dict[str, Any]:
        idx = self.rag.get_index_status()
        ollama_state = self.ollama.inspect_readiness()
        return {
            "dataset_loaded": idx.get("dataset_loaded", False),
            "observed_counts": idx.get("counts", {}),
            "expected_diagnostics": EXPECTED_DATASET_DIAGNOSTICS,
            "excluded_synthetic_files": EXCLUDED_SYNTHETIC_FILES,
            "excluded_non_policy_documents": EXCLUDED_NON_POLICY_DOCUMENTS,
            "chroma_status": idx.get("chroma", {}),
            "latest_ingestion": idx.get("latest_ingestion"),
            "ollama_status": ollama_state,
            "benchmark_cases_count": len(BENCHMARK_CASES),
        }

    def get_programs(self) -> Dict[str, Any]:
        conn = self._connect()
        try:
            cur = conn.cursor()
            rows = cur.execute(
                """
                SELECT p.*,
                       (SELECT COUNT(*) FROM courses_master_official c WHERE c.program_id = p.program_id) AS course_row_count,
                       (SELECT COUNT(*) FROM prerequisite_rules r WHERE r.program_id = p.program_id) AS prereq_rule_count,
                       (SELECT COUNT(*) FROM data_gaps g WHERE g.program_id = p.program_id) AS gap_count,
                       (SELECT COUNT(*) FROM website_conflicts w WHERE w.program_id = p.program_id) AS conflict_count
                FROM programs p
                ORDER BY p.program_id
                """
            ).fetchall()
            programs = [
                {
                    "program_id": r["program_id"],
                    "program_code": r["program_code"],
                    "department_id": r["department_id"],
                    "faculty_id": r["faculty_id"],
                    "name_ar": r["name_ar"] or "",
                    "name_en": r["name_en"] or "",
                    "degree_level": r["degree_level"] or "Bachelor",
                    "evidence_level": r["evidence_level"],
                    "is_departmental_listing_only": bool(r["is_departmental_listing_only"]),
                    "total_credits_reported": r["total_credits_reported"],
                    "caveat_note_ar": r["caveat_note_ar"] or "",
                    "caveat_note_en": r["caveat_note_en"] or "",
                    "source_url": r["source_url"] or "",
                    "last_verified_at": r["last_verified_at"] or "",
                    "course_row_count": r["course_row_count"],
                    "prereq_rule_count": r["prereq_rule_count"],
                    "gap_count": r["gap_count"],
                    "conflict_count": r["conflict_count"],
                }
                for r in rows
            ]
            return {
                "dataset_loaded": len(programs) > 0,
                "count": len(programs),
                "programs": programs,
            }
        finally:
            conn.close()

    def get_courses(
        self,
        q: str = "",
        program_id: str = "",
        has_conflict: Optional[bool] = None,
        page: int = 1,
        page_size: int = 25,
    ) -> Dict[str, Any]:
        page = max(1, page)
        page_size = max(1, min(100, page_size))
        offset = (page - 1) * page_size

        conn = self._connect()
        try:
            cur = conn.cursor()
            where_clauses = ["1=1"]
            params: List[Any] = []

            if program_id.strip():
                where_clauses.append("program_id = ?")
                params.append(program_id.strip())

            if has_conflict is not None:
                where_clauses.append("has_conflict = ?")
                params.append(1 if has_conflict else 0)

            clean_q = q.strip()
            if clean_q:
                norm_q = normalize_arabic_for_search(clean_q)
                where_clauses.append(
                    "(course_number LIKE ? OR normalized_search_text LIKE ? OR title_en LIKE ? OR title_ar LIKE ?)"
                )
                params.extend([f"%{clean_q}%", f"%{norm_q}%", f"%{clean_q}%", f"%{clean_q}%"])

            where_sql = " AND ".join(where_clauses)
            total = cur.execute(
                f"SELECT COUNT(*) FROM courses_master_official WHERE {where_sql}",
                params,
            ).fetchone()[0]

            rows = cur.execute(
                f"""
                SELECT * FROM courses_master_official
                WHERE {where_sql}
                ORDER BY course_number ASC, program_id ASC, row_id ASC
                LIMIT ? OFFSET ?
                """,
                [*params, page_size, offset],
            ).fetchall()

            items = [
                {
                    "row_id": r["row_id"],
                    "course_number": r["course_number"],
                    "program_id": r["program_id"] or "",
                    "department_id": r["department_id"] or "",
                    "faculty_id": r["faculty_id"] or "",
                    "title_ar": "" if bool(r["is_arabic_placeholder"]) else (r["title_ar"] or ""),
                    "title_en": r["title_en"] or "",
                    "is_arabic_placeholder": bool(r["is_arabic_placeholder"]),
                    "credit_hours": r["credit_hours"],
                    "lecture_hours": r["lecture_hours"],
                    "lab_hours": r["lab_hours"],
                    "requirement_label": r["requirement_Label"] or "catalog_listed",
                    "raw_prerequisite_text": r["raw_prerequisite_text"] or "",
                    "source_id": r["source_id"] or "",
                    "source_url": r["source_url"] or "",
                    "last_verified_at": r["last_verified_at"] or "",
                    "has_conflict": bool(r["has_conflict"]),
                    "has_gap": bool(r["has_gap"]),
                }
                for r in rows
            ]
            return {
                "total": total,
                "page": page,
                "page_size": page_size,
                "courses": items,
            }
        finally:
            conn.close()

    def get_course_detail(self, course_number: str) -> Dict[str, Any]:
        norm_code = preserve_course_number(course_number)
        conn = self._connect()
        try:
            cur = conn.cursor()
            cmo_rows = cur.execute(
                "SELECT * FROM courses_master_official WHERE course_number = ? ORDER BY program_id, row_id",
                (norm_code,),
            ).fetchall()
            if not cmo_rows:
                return {"found": False, "course_number": norm_code}

            prereqs = [
                dict(r)
                for r in cur.execute(
                    "SELECT * FROM prerequisite_rules WHERE course_number = ? ORDER BY rule_id",
                    (norm_code,),
                ).fetchall()
            ]
            plan_reqs = [
                dict(r)
                for r in cur.execute(
                    "SELECT * FROM plan_course_requirements WHERE course_number = ? ORDER BY req_row_id",
                    (norm_code,),
                ).fetchall()
            ]
            conflicts = [
                dict(r)
                for r in cur.execute(
                    "SELECT * FROM website_conflicts WHERE course_number = ? ORDER BY conflict_id",
                    (norm_code,),
                ).fetchall()
            ]
            gaps = [
                dict(r)
                for r in cur.execute(
                    "SELECT * FROM data_gaps WHERE course_number = ? ORDER BY gap_id",
                    (norm_code,),
                ).fetchall()
            ]
            provenance = [
                dict(r)
                for r in cur.execute(
                    "SELECT * FROM provenance_by_row WHERE course_number = ? ORDER BY provenance_id",
                    (norm_code,),
                ).fetchall()
            ]

            catalog_rows = [
                {
                    "row_id": r["row_id"],
                    "course_number": r["course_number"],
                    "program_id": r["program_id"] or "",
                    "department_id": r["department_id"] or "",
                    "faculty_id": r["faculty_id"] or "",
                    "title_ar": "" if bool(r["is_arabic_placeholder"]) else (r["title_ar"] or ""),
                    "title_en": r["title_en"] or "",
                    "is_arabic_placeholder": bool(r["is_arabic_placeholder"]),
                    "credit_hours": r["credit_hours"],
                    "lecture_hours": r["lecture_hours"],
                    "lab_hours": r["lab_hours"],
                    "description_ar": r["description_ar"] or "",
                    "description_en": r["description_en"] or "",
                    "raw_prerequisite_text": r["raw_prerequisite_text"] or "",
                    "requirement_label": r["requirement_Label"] or "catalog_listed",
                    "source_id": r["source_id"] or "",
                    "source_url": r["source_url"] or "",
                    "last_verified_at": r["last_verified_at"] or "",
                    "has_conflict": bool(r["has_conflict"]),
                    "has_gap": bool(r["has_gap"]),
                }
                for r in cmo_rows
            ]

            return {
                "found": True,
                "course_number": norm_code,
                "program_specific_rows": catalog_rows,
                "prerequisite_rules": prereqs,
                "plan_course_requirements": plan_reqs,
                "website_conflicts": conflicts,
                "data_gaps": gaps,
                "provenance_records": provenance,
                "policy_caveat_en": (
                    "Note: 'last_verified_at' reflects the source verification timestamp, not an "
                    "official university policy effective date. 'recommended' in plan_course_requirements "
                    "does not prove mandatory graduation status."
                ),
            }
        finally:
            conn.close()

    def get_evidence(self, limit: int = 100) -> Dict[str, Any]:
        conn = self._connect()
        try:
            cur = conn.cursor()
            conflicts = [
                dict(r)
                for r in cur.execute(
                    "SELECT * FROM website_conflicts ORDER BY conflict_id LIMIT ?", (limit,)
                ).fetchall()
            ]
            gaps = [
                dict(r)
                for r in cur.execute(
                    "SELECT * FROM data_gaps ORDER BY gap_id LIMIT ?", (limit,)
                ).fetchall()
            ]
            sources = [
                dict(r)
                for r in cur.execute(
                    "SELECT * FROM sources ORDER BY source_id LIMIT ?", (limit,)
                ).fetchall()
            ]
            return {
                "website_conflicts": conflicts,
                "data_gaps": gaps,
                "sources": sources,
                "excluded_synthetic_files": EXCLUDED_SYNTHETIC_FILES,
                "excluded_non_policy_documents": EXCLUDED_NON_POLICY_DOCUMENTS,
            }
        finally:
            conn.close()
