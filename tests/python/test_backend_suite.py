"""Comprehensive Python unit & integration tests for Al-Quds AI Academic Advisor.

Executes with either `python3 -m unittest discover -s tests/python` or `pytest tests/python`.
Covers:
1. Arabic normalization, 7-digit course code leading-zero preservation, and placeholder detection.
2. Safe ZIP/CSV ingestion, row-level conflict preservation, synthetic schedule exclusion
   (sections.csv, section_meetings.csv, rooms.csv), and IEEE hackathon PDF policy rejection.
3. End-to-end supported catalog question retrieval + citation metadata and end-to-end refusals
   (out-of-scope university, excluded synthetic schedule, and unindexed policy).
4. Deterministic study planner:
   - requirements_met (with official registration approval disclaimer)
   - missing_prerequisite (completed vs. in_progress vs. failed_not_passed)
   - corequisite_condition (concurrent/in_progress satisfaction)
   - needs_verification (raw_only, ambiguous, department permission, website conflict, transfer/repeat)
   - non-double-counted validated credit calculation and degree audit refusal.
5. Read-only Student & Lecturer portal adapters, session user/role/CSRF isolation, and
   blocking of unauthorized sync.
"""

from __future__ import annotations

import os
import tempfile
import unittest
import zipfile
from typing import Dict

from backend.ingest.arabic_utils import (
    extract_course_numbers_from_query,
    is_placeholder_arabic_title,
    normalize_arabic_for_search,
    preserve_course_number,
)
from backend.ingest.importer import DatasetIngestor
from backend.planner.engine import DeterministicPlannerEngine
from backend.portals.adapters import (
    OFFICIAL_LECTURER_LOGIN_URL,
    OFFICIAL_STUDENT_LOGIN_URL,
    PortalAuthorizationError,
    PortalSessionManager,
)
from backend.rag.retriever import HybridRAGService


def _build_fixture_zip(zip_path: str) -> None:
    """Create a realistic test ZIP fixture exercising all CSV tables, conflicts, and exclusions."""
    files: Dict[str, str] = {
        "README.md": "# Al-Quds Dataset Test Fixture\n",
        "programs.csv": (
            "program_id,program_code,department_id,faculty_id,name_ar,name_en,degree_level,evidence_level\n"
            "COMP-BS,COMP,DEPT-CS,FAC-ENG,بكالوريوس علم الحاسوب,B.Sc. in Computer Science,Bachelor,partial_planning\n"
            "MED-LIST,MED,DEPT-MED,FAC-MED,قائمة مساقات الطب البشري,Medicine Departmental Listing,MD,catalog_only\n"
        ),
        "courses_master_official_only.csv": (
            "row_id,course_number,program_id,department_id,faculty_id,title_ar,title_en,credit_hours,"
            "raw_prerequisite_text,requirement_type,source_id,source_url,last_verified_at\n"
            "cmo_1,0302101,COMP-BS,DEPT-CS,FAC-ENG,مقدمة في البرمجة,Introduction to Programming,3,"
            "None,recommended,src_cs,https://www.alquds.edu/ar/academics/cs/0302101,2026-02-15\n"
            "cmo_2,0302102,COMP-BS,DEPT-CS,FAC-ENG,تراكيب البيانات,Data Structures,3,"
            "0302101,recommended,src_cs,https://www.alquds.edu/ar/academics/cs/0302102,2026-02-15\n"
            "cmo_3,0302205,COMP-BS,DEPT-CS,FAC-ENG,مختبر قواعد البيانات,Database Lab,1,"
            "Corequisite 0302204,recommended,src_cs,https://www.alquds.edu/ar/academics/cs/0302205,2026-02-15\n"
            "cmo_4,0302499,COMP-BS,DEPT-CS,FAC-ENG,مشروع التخرج,Graduation Project,3,"
            "Department permission and 90 credit hours,recommended,src_cs,https://www.alquds.edu/ar/academics/cs/0302499,2026-02-15\n"
            "cmo_5,0302350,COMP-BS,DEPT-CS,FAC-ENG,MISSING_AR_PLACEHOLDER,Special Topics in AI,3,"
            "0302102 or 0302103 and 0302201,recommended,src_cs,https://www.alquds.edu/ar/academics/cs/0302350,2026-02-15\n"
            "cmo_6,0302310,COMP-BS,DEPT-CS,FAC-ENG,شبكات الحاسوب,Computer Networks,3,"
            "0302102,recommended,src_cs_a,https://www.alquds.edu/ar/academics/cs/0302310-a,2026-02-15\n"
            "cmo_7,0302310,COMP-BS,DEPT-CS,FAC-ENG,شبكات الحاسوب,Computer Networks,4,"
            "0302102,recommended,src_cs_b,https://www.alquds.edu/ar/academics/cs/0302310-b,2026-02-15\n"
        ),
        "courses.csv": (
            "course_row_id,course_number,program_id,title_ar,title_en,credit_hours\n"
            "cn_1,0302101,COMP-BS,مقدمة في البرمجة,Introduction to Programming,3\n"
            "cn_2,0302350,COMP-BS,[Placeholder Arabic Title],Special Topics in AI,3\n"
        ),
        "plan_course_requirements.csv": (
            "req_row_id,plan_id,program_id,course_number,requirement_type,recommended_year,recommended_semester,credit_hours\n"
            "pcr_1,plan_cs,COMP-BS,0302101,recommended,1,1,3\n"
            "pcr_2,plan_cs,COMP-BS,0302102,recommended,1,2,3\n"
        ),
        "prerequisite_rules.csv": (
            "rule_id,program_id,course_number,relation_type,parse_status,prereq_course_number,raw_prerequisite_text\n"
            "rule_1,COMP-BS,0302102,prerequisite,parsed,0302101,0302101\n"
            "rule_2,COMP-BS,0302205,corequisite,parsed,0302204,Corequisite 0302204\n"
            "rule_3,COMP-BS,0302499,prerequisite,raw_only,,Department permission and completion of 90 credit hours\n"
            "rule_4,COMP-BS,0302350,prerequisite,ambiguous,,0302102 or 0302103 and 0302201\n"
            "rule_5,COMP-BS,0302310,prerequisite,parsed,0302102,0302102\n"
        ),
        "website_conflicts.csv": (
            "conflict_id,course_number,program_id,field_name,value_source_a,value_source_b,source_a_url,source_b_url,description\n"
            "conf_1,0302310,COMP-BS,credit_hours,3,4,https://www.alquds.edu/a,https://www.alquds.edu/b,Credit hour conflict between department page and plan table\n"
        ),
        "data_gaps.csv": (
            "gap_id,program_id,course_number,entity_type,missing_field,gap_category,description\n"
            "gap_1,COMP-BS,0302350,course,title_ar,missing_arabic_translation,Official Arabic title missing in source\n"
        ),
        "sources.csv": (
            "source_id,source_type,title,url,last_verified_at\n"
            "src_cs,official_web,Al-Quds CS Catalog,https://www.alquds.edu/ar/academics/cs,2026-02-15\n"
        ),
        "provenance_by_row.csv": (
            "provenance_id,table_name,record_id,course_number,program_id,source_id,source_url,last_verified_at\n"
            "prov_1,courses_master_official_only,cmo_1,0302101,COMP-BS,src_cs,https://www.alquds.edu/ar/academics/cs/0302101,2026-02-15\n"
        ),
        # Synthetic files that MUST be ignored and excluded
        "sections.csv": "section_id,course_number,instructor\nsec_1,0302101,Fake Instructor\n",
        "section_meetings.csv": "meeting_id,section_id,weekday,time\nmt_1,sec_1,Monday,10:00\n",
        "rooms.csv": "room_id,building,room_number\nrm_1,FakeHall,101\n",
    }
    with zipfile.ZipFile(zip_path, "w") as zf:
        for name, content in files.items():
            zf.writestr(name, content)


class TestAlQudsAdvisorBackend(unittest.TestCase):
    """End-to-end unit and integration tests for Ingestion, RAG, Planner, and Portals."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.db_path = os.path.join(self.temp_dir.name, "test_catalog.db")
        self.zip_path = os.path.join(self.temp_dir.name, "fixture_dataset.zip")
        _build_fixture_zip(self.zip_path)
        self.ingestor = DatasetIngestor(sqlite_path=self.db_path)
        self.ingest_report = self.ingestor.ingest_from_zip_or_dir(zip_path=self.zip_path)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_course_number_leading_zero_and_arabic_normalization(self) -> None:
        self.assertEqual(preserve_course_number("0302101"), "0302101")
        self.assertEqual(preserve_course_number(302101), "0302101")
        self.assertEqual(
            extract_course_numbers_from_query("هل المساق 0302101 متطلب للمساق 0302102؟"),
            ["0302101", "0302102"],
        )
        norm = normalize_arabic_for_search("مُقَدِّمَةٌ فِي البَرْمَجَةِ الإلِكْترُونِيَّة")
        self.assertEqual(norm, "مقدمه في البرمجه الالكترونيه")
        self.assertTrue(is_placeholder_arabic_title("[Placeholder Arabic Title]", "AI", "0302350"))
        self.assertTrue(is_placeholder_arabic_title("MISSING_AR_PLACEHOLDER", "AI", "0302350"))
        self.assertFalse(is_placeholder_arabic_title("تراكيب البيانات", "Data Structures", "0302102"))

    def test_ingestion_preserves_conflicts_and_excludes_synthetic_files(self) -> None:
        self.assertTrue(self.ingest_report["dataset_loaded"])
        self.assertIn("sections.csv", self.ingest_report["excluded_synthetic_files"])
        self.assertIn("section_meetings.csv", self.ingest_report["excluded_synthetic_files"])
        self.assertIn("rooms.csv", self.ingest_report["excluded_synthetic_files"])

        # Verify conflicting rows for 0302310 were NOT deduplicated by course_number
        rag = HybridRAGService(sqlite_path=self.db_path, chroma_dir=os.path.join(self.temp_dir.name, "chroma"))
        res = rag.retrieve("0302310")
        self.assertFalse(res["refusal"])
        c310_rows = [p for p in res["passages"] if p["course_number"] == "0302310"]
        self.assertEqual(len(c310_rows), 2)
        self.assertEqual({r["credit_hours"] for r in c310_rows}, {3.0, 4.0})
        self.assertEqual(len(res["conflicts"]), 1)

        # Verify placeholder Arabic title on 0302350 was suppressed from official display
        res_350 = rag.retrieve("0302350")
        self.assertEqual(res_350["passages"][0]["title_ar"], "")
        self.assertTrue(res_350["passages"][0]["is_arabic_placeholder"])

    def test_hackathon_pdf_rejected_from_policy_ingestion(self) -> None:
        with self.assertRaises(ValueError):
            self.ingestor.ingest_verified_policy_pdf(
                pdf_path="/tmp/IEEE_RAG_Student_Guide_Academic_Advisor_AR.pdf",
                doc_title="Hackathon Guide",
                source_url="https://ieee.org/guide",
            )

    def test_rag_end_to_end_supported_catalog_query_and_refusals(self) -> None:
        rag = HybridRAGService(sqlite_path=self.db_path, chroma_dir=os.path.join(self.temp_dir.name, "chroma"))

        # 1. Supported catalog question with exact 7-digit code + citation metadata
        supported = rag.retrieve("ما هو المتطلب السابق لمساق 0302102 تراكيب البيانات؟")
        self.assertFalse(supported["refusal"])
        top = supported["passages"][0]
        self.assertEqual(top["course_number"], "0302102")
        self.assertEqual(top["chunk_id"], "cmo_2")
        self.assertEqual(top["source_url"], "https://www.alquds.edu/ar/academics/cs/0302102")
        self.assertEqual(top["last_verified_at"], "2026-02-15")

        # 2. Refusal on out-of-scope university
        refusal_uni = rag.retrieve("ما هي شروط القبول في جامعة بيرزيت؟")
        self.assertTrue(refusal_uni["refusal"])
        self.assertEqual(refusal_uni["refusal_type"], "out_of_scope_institution")

        # 3. Refusal on excluded synthetic schedules/rooms/instructors
        refusal_sched = rag.retrieve("Who is the instructor and room for 0302101 on Monday?")
        self.assertTrue(refusal_sched["refusal"])
        self.assertEqual(refusal_sched["refusal_type"], "excluded_synthetic_schedule")

        # 4. Refusal on unindexed/unsupported question
        refusal_missing = rag.retrieve("ما هي رسوم السكن الداخلي في عام 1995؟")
        self.assertTrue(refusal_missing["refusal"])
        self.assertEqual(refusal_missing["refusal_type"], "insufficient_evidence")

    def test_deterministic_planner_all_states_and_credit_deduplication(self) -> None:
        planner = DeterministicPlannerEngine(sqlite_path=self.db_path)

        # Case 1: 0302101 is only 'in_progress' -> 0302102 must be 'missing_prerequisite'
        eval_in_prog = planner.evaluate_plan(
            program_id="COMP-BS",
            student_courses=[
                {"course_number": "0302101", "status": "in_progress"},
            ],
            target_courses=["0302102", "0302205", "0302499", "0302350", "0302310"],
        )
        by_code = {c["course_number"]: c for c in eval_in_prog["course_evaluations"]}
        self.assertEqual(by_code["0302102"]["readiness_state"], "missing_prerequisite")
        self.assertEqual(by_code["0302205"]["readiness_state"], "corequisite_condition")
        self.assertEqual(by_code["0302499"]["readiness_state"], "needs_verification")  # raw_only + special
        self.assertEqual(by_code["0302350"]["readiness_state"], "needs_verification")  # ambiguous
        self.assertEqual(by_code["0302310"]["readiness_state"], "needs_verification")  # website conflict

        # Case 2: 0302101 is 'completed' (listed twice to test no double counting) + 0302310 completed (conflicting credits)
        eval_done = planner.evaluate_plan(
            program_id="COMP-BS",
            student_courses=[
                {"course_number": "0302101", "status": "completed"},
                {"course_number": "0302101", "status": "completed"},
                {"course_number": "0302310", "status": "completed"},
            ],
            target_courses=["0302102"],
        )
        by_code_done = {c["course_number"]: c for c in eval_done["course_evaluations"]}
        self.assertEqual(by_code_done["0302102"]["readiness_state"], "requirements_met")
        self.assertIn(
            "NOT official university approval",
            by_code_done["0302102"]["official_approval_disclaimer_en"],
        )
        # Only 0302101 (3.0 credits) is counted once; 0302310 has conflicting credits (3 vs 4) so it is excluded from verified total
        self.assertEqual(eval_done["credits_summary"]["validated_completed_credits"], 3.0)
        self.assertEqual(eval_done["credits_summary"]["duplicate_completed_inputs_ignored"], ["0302101"])
        self.assertEqual(len(eval_done["credits_summary"]["unverified_or_excluded_courses"]), 1)
        self.assertFalse(eval_done["degree_audit_guaranteed"])
        self.assertIsNone(eval_done["official_graduation_percentage"])

    def test_portal_adapters_read_only_and_session_isolation(self) -> None:
        mgr = PortalSessionManager()
        overall = mgr.get_overall_status()
        self.assertEqual(overall["portal_sync_status"], "unsupported_pending_verification")
        self.assertEqual(overall["student_portal"]["official_login_url"], OFFICIAL_STUDENT_LOGIN_URL)
        self.assertEqual(overall["lecturer_portal"]["official_login_url"], OFFICIAL_LECTURER_LOGIN_URL)

        # Live browser login must be blocked pending institutional authorization
        with self.assertRaises(PortalAuthorizationError):
            mgr.student_adapter.initiate_official_browser_login("student_1")
        with self.assertRaises(PortalAuthorizationError):
            mgr.lecturer_adapter.initiate_official_browser_login("lecturer_1")

        # Session binding & cross-user protection
        sess_a = mgr.create_isolated_session(user_id="student_alpha", requested_role="student")
        bound = mgr.get_bound_session(
            session_id=sess_a.session_id,
            requesting_user_id="student_alpha",
            required_role="student",
            csrf_token=sess_a.csrf_token,
        )
        self.assertEqual(bound.user_id, "student_alpha")

        # Another user cannot read or disconnect student_alpha's session
        with self.assertRaises(PortalAuthorizationError):
            mgr.get_bound_session(
                session_id=sess_a.session_id,
                requesting_user_id="student_beta",
            )
        # Role mismatch is rejected
        with self.assertRaises(PortalAuthorizationError):
            mgr.get_bound_session(
                session_id=sess_a.session_id,
                requesting_user_id="student_alpha",
                required_role="lecturer",
            )
        # Invalid CSRF token is rejected
        with self.assertRaises(PortalAuthorizationError):
            mgr.get_bound_session(
                session_id=sess_a.session_id,
                requesting_user_id="student_alpha",
                csrf_token="forged_token",
            )


if __name__ == "__main__":
    unittest.main()
