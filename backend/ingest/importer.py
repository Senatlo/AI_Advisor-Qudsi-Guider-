"""Safe ZIP/CSV and verified PDF ingestion pipeline for Al-Quds AI Academic Advisor.

Enforces:
- 7-digit string course numbers (preserving leading zeros).
- Row-level program-specific catalog preservation (no naive deduplication by course_number).
- Hard exclusion of synthetic schedule files (sections.csv, section_meetings.csv, rooms.csv).
- Hard exclusion of non-policy hackathon documents (IEEE_RAG_Student_Guide_Academic_Advisor_AR.pdf)
  from the university policy/bylaws table.
- Placeholder detection for normalized Arabic course titles in courses.csv.
- Exact diagnostic comparison against observed dataset metrics without fabricating missing records.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sqlite3
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from backend.config import (
    EXCLUDED_NON_POLICY_DOCUMENTS,
    EXCLUDED_SYNTHETIC_FILES,
    EXPECTED_DATASET_DIAGNOSTICS,
    SUPPORTED_DATASET_CSV_FILES,
    get_settings,
)
from backend.ingest.arabic_utils import (
    is_placeholder_arabic_title,
    normalize_arabic_for_search,
    preserve_course_number,
)
from backend.ingest.schema import init_db


def _first_present(row: Dict[str, Any], keys: Iterable[str], default: str = "") -> str:
    for k in keys:
        if k in row and row[k] is not None and str(row[k]).strip() != "":
            return str(row[k]).strip()
    return default


def _parse_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    s = str(val).strip()
    if not s or s.lower() in {"nan", "null", "none", "n/a", "-"}:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _parse_int(val: Any) -> Optional[int]:
    f = _parse_float(val)
    return int(f) if f is not None else None


def _extract_7digit_courses(text: str) -> List[str]:
    if not text:
        return []
    found: List[str] = []
    for match in re.findall(r"\b(\d{7})\b", text):
        if match not in found:
            found.append(match)
    return found


def _build_default_expression_from_row(row: Dict[str, Any], parse_status: str) -> Optional[str]:
    """Build or preserve JSON boolean prerequisite expression only when parse_status == 'parsed'."""
    if parse_status != "parsed":
        return None
    existing_json = _first_present(
        row,
        ("parsed_expression_json", "expression_json", "ast_json", "parsed_rule_json", "parsed_rule"),
    )
    if existing_json.startswith("{") or existing_json.startswith("["):
        return existing_json

    raw_text = _first_present(
        row, ("raw_prerequisite_text", "prerequisite_text", "raw_text", "rule_text", "prereq_text")
    )
    prereq_code = preserve_course_number(
        _first_present(
            row,
            (
                "prerequisite_course_number",
                "prereq_course_number",
                "required_course_number",
                "prereq_code",
            ),
        )
    )
    codes = [prereq_code] if prereq_code and len(prereq_code) == 7 else _extract_7digit_courses(raw_text)
    if not codes:
        return None

    operator = _first_present(row, ("operator", "logical_operator", "combinator"), "").upper()
    if not operator:
        lowered = raw_text.lower()
        has_and = any(tok in lowered for tok in (" and ", " و ", " و", "&", "+"))
        has_or = any(tok in lowered for tok in (" or ", " أو ", " او ", "/"))
        if has_and and has_or and len(codes) > 2:
            # Mixed unparenthesized boolean operators cannot be guessed safely
            return None
        operator = "OR" if has_or and not has_and else "AND"

    if len(codes) == 1:
        return json.dumps({"type": "COURSE", "course_number": codes[0]})
    return json.dumps(
        {
            "type": operator if operator in {"AND", "OR"} else "AND",
            "children": [{"type": "COURSE", "course_number": c} for c in codes],
        }
    )


class DatasetIngestor:
    """Ingests the Al-Quds University CSV dataset into SQLite (and optionally ChromaDB)."""

    def __init__(self, sqlite_path: str) -> None:
        self.sqlite_path = sqlite_path
        Path(self.sqlite_path).parent.mkdir(parents=True, exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.sqlite_path)
        conn.row_factory = sqlite3.Row
        init_db(conn)
        return conn

    def ingest_from_zip_or_dir(
        self,
        zip_path: Optional[str] = None,
        dir_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Inspect and ingest dataset from ZIP archive or extracted folder without fabricating data."""
        csv_blobs: Dict[str, str] = {}
        readme_text = ""
        ignored_synthetic: List[str] = []
        ignored_non_policy: List[str] = []
        source_location = ""

        if zip_path and os.path.isfile(zip_path):
            source_location = os.path.abspath(zip_path)
            with zipfile.ZipFile(zip_path, "r") as zf:
                for member in zf.namelist():
                    base = os.path.basename(member)
                    if not base:
                        continue
                    if base in EXCLUDED_SYNTHETIC_FILES:
                        ignored_synthetic.append(base)
                        continue
                    if base in EXCLUDED_NON_POLICY_DOCUMENTS:
                        ignored_non_policy.append(base)
                        continue
                    if base.lower() == "readme.md":
                        readme_text = zf.read(member).decode("utf-8", errors="replace")
                    elif base.endswith(".csv"):
                        csv_blobs[base] = zf.read(member).decode("utf-8-sig", errors="replace")
        elif dir_path and os.path.isdir(dir_path):
            source_location = os.path.abspath(dir_path)
            for root, _dirs, files in os.walk(dir_path):
                for fname in files:
                    if fname in EXCLUDED_SYNTHETIC_FILES:
                        ignored_synthetic.append(fname)
                        continue
                    if fname in EXCLUDED_NON_POLICY_DOCUMENTS:
                        ignored_non_policy.append(fname)
                        continue
                    full = os.path.join(root, fname)
                    if fname.lower() == "readme.md":
                        with open(full, "r", encoding="utf-8", errors="replace") as f:
                            readme_text = f.read()
                    elif fname.endswith(".csv"):
                        with open(full, "r", encoding="utf-8-sig", errors="replace") as f:
                            csv_blobs[fname] = f.read()
        else:
            return {
                "dataset_loaded": False,
                "reason": (
                    "Dataset archive 'alquds_expanded_dataset(1).zip' or extracted directory was not "
                    "found on the local filesystem. Per academic integrity rules, zero synthetic or "
                    "guessed course records were fabricated."
                ),
                "expected_diagnostics": EXPECTED_DATASET_DIAGNOSTICS,
                "excluded_synthetic_files": EXCLUDED_SYNTHETIC_FILES,
                "excluded_non_policy_documents": EXCLUDED_NON_POLICY_DOCUMENTS,
            }

        return self._ingest_csv_map(
            csv_blobs=csv_blobs,
            readme_text=readme_text,
            source_location=source_location,
            ignored_synthetic=sorted(set(ignored_synthetic or EXCLUDED_SYNTHETIC_FILES)),
            ignored_non_policy=sorted(set(ignored_non_policy or EXCLUDED_NON_POLICY_DOCUMENTS)),
        )

    def _read_csv_rows(self, csv_text: str) -> List[Dict[str, str]]:
        if not csv_text.strip():
            return []
        reader = csv.DictReader(io.StringIO(csv_text))
        return [dict(r) for r in reader]

    def _ingest_csv_map(
        self,
        csv_blobs: Dict[str, str],
        readme_text: str,
        source_location: str,
        ignored_synthetic: List[str],
        ignored_non_policy: List[str],
    ) -> Dict[str, Any]:
        conn = self._connect()
        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            cur = conn.cursor()
            # Clear existing catalog tables before fresh deterministic import
            for tbl in (
                "faculties",
                "departments",
                "programs",
                "courses_master_official",
                "courses_normalized",
                "academic_plans",
                "requirement_groups",
                "plan_course_requirements",
                "prerequisite_rules",
                "sources",
                "provenance_by_row",
                "website_conflicts",
                "data_gaps",
            ):
                cur.execute(f"DELETE FROM {tbl}")
            try:
                cur.execute("DELETE FROM catalog_fts")
            except sqlite3.OperationalError:
                pass

            # 1. Sources
            sources_by_id: Dict[str, Dict[str, str]] = {}
            for idx, r in enumerate(self._read_csv_rows(csv_blobs.get("sources.csv", ""))):
                sid = _first_present(r, ("source_id", "id"), f"src_{idx+1}")
                url = _first_present(r, ("url", "source_url", "official_url"))
                verified_at = _first_present(r, ("last_verified_at", "verified_at", "scraped_at"))
                effective_date = _first_present(r, ("effective_policy_date", "effective_date"), "")
                sources_by_id[sid] = {"url": url, "last_verified_at": verified_at}
                cur.execute(
                    """
                    INSERT OR REPLACE INTO sources
                    (source_id, source_type, title, url, domain, last_verified_at, effective_policy_date, notes, raw_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        sid,
                        _first_present(r, ("source_type", "type")),
                        _first_present(r, ("title", "source_title", "name")),
                        url,
                        _first_present(r, ("domain", "host"), "alquds.edu"),
                        verified_at,
                        effective_date,
                        _first_present(r, ("notes", "description")),
                        json.dumps(r, ensure_ascii=False),
                    ),
                )

            # 2. Faculties & Departments
            for idx, r in enumerate(self._read_csv_rows(csv_blobs.get("faculties.csv", ""))):
                fid = _first_present(r, ("faculty_id", "faculty_code", "id"), f"fac_{idx+1}")
                cur.execute(
                    """
                    INSERT OR REPLACE INTO faculties (faculty_id, name_ar, name_en, source_url, raw_json)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        fid,
                        _first_present(r, ("name_ar", "faculty_name_ar", "title_ar")),
                        _first_present(r, ("name_en", "faculty_name_en", "title_en", "name")),
                        _first_present(r, ("source_url", "url")),
                        json.dumps(r, ensure_ascii=False),
                    ),
                )

            for idx, r in enumerate(self._read_csv_rows(csv_blobs.get("departments.csv", ""))):
                did = _first_present(r, ("department_id", "department_code", "id"), f"dept_{idx+1}")
                cur.execute(
                    """
                    INSERT OR REPLACE INTO departments
                    (department_id, faculty_id, name_ar, name_en, source_url, raw_json)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        did,
                        _first_present(r, ("faculty_id", "faculty_code")),
                        _first_present(r, ("name_ar", "department_name_ar", "title_ar")),
                        _first_present(r, ("name_en", "department_name_en", "title_en", "name")),
                        _first_present(r, ("source_url", "url")),
                        json.dumps(r, ensure_ascii=False),
                    ),
                )

            # 3. Website Conflicts (53 expected) & Data Gaps (1,655 expected)
            conflict_courses: set[Tuple[str, str]] = set()
            conflict_course_codes: set[str] = set()
            conflict_rows = self._read_csv_rows(csv_blobs.get("website_conflicts.csv", ""))
            for idx, r in enumerate(conflict_rows):
                cid = _first_present(r, ("conflict_id", "id"), f"conflict_{idx+1}")
                cnum = preserve_course_number(
                    _first_present(r, ("course_number", "course_code", "course_id"))
                )
                pid = _first_present(r, ("program_id", "program_code", "department_id"))
                if cnum:
                    conflict_course_codes.add(cnum)
                    conflict_courses.add((pid, cnum))
                cur.execute(
                    """
                    INSERT OR REPLACE INTO website_conflicts
                    (conflict_id, course_number, program_id, field_name, value_source_a, value_source_b,
                     source_a_url, source_b_url, conflict_type, severity, description, resolution_status, raw_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        cid,
                        cnum,
                        pid,
                        _first_present(r, ("field_name", "field", "conflict_field")),
                        _first_present(r, ("value_source_a", "value_a", "official_value")),
                        _first_present(r, ("value_source_b", "value_b", "conflicting_value")),
                        _first_present(r, ("source_a_url", "url_a")),
                        _first_present(r, ("source_b_url", "url_b")),
                        _first_present(r, ("conflict_type", "type")),
                        _first_present(r, ("severity", "level"), "warning"),
                        _first_present(r, ("description", "notes", "summary")),
                        _first_present(r, ("resolution_status", "status"), "unresolved_in_source"),
                        json.dumps(r, ensure_ascii=False),
                    ),
                )

            gap_course_codes: set[str] = set()
            gap_programs: Dict[str, int] = {}
            gap_rows = self._read_csv_rows(csv_blobs.get("data_gaps.csv", ""))
            for idx, r in enumerate(gap_rows):
                gid = _first_present(r, ("gap_id", "id"), f"gap_{idx+1}")
                cnum = preserve_course_number(
                    _first_present(r, ("course_number", "course_code", "course_id"))
                )
                pid = _first_present(r, ("program_id", "program_code", "department_id"))
                if cnum:
                    gap_course_codes.add(cnum)
                if pid:
                    gap_programs[pid] = gap_programs.get(pid, 0) + 1
                cur.execute(
                    """
                    INSERT OR REPLACE INTO data_gaps
                    (gap_id, program_id, course_number, entity_type, missing_field, gap_category,
                     impact_on_advising, description, source_url, raw_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        gid,
                        pid,
                        cnum,
                        _first_present(r, ("entity_type", "table_name", "scope")),
                        _first_present(r, ("missing_field", "field_name", "field")),
                        _first_present(r, ("gap_category", "category", "gap_type")),
                        _first_present(r, ("impact_on_advising", "impact", "severity")),
                        _first_present(r, ("description", "notes", "reason")),
                        _first_present(r, ("source_url", "url")),
                        json.dumps(r, ensure_ascii=False),
                    ),
                )

            # 4. Provenance by row
            prov_by_record: Dict[str, Dict[str, str]] = {}
            for idx, r in enumerate(self._read_csv_rows(csv_blobs.get("provenance_by_row.csv", ""))):
                prov_id = _first_present(r, ("provenance_id", "id", "row_id"), f"prov_{idx+1}")
                rec_id = _first_present(r, ("record_id", "row_id", "target_row_id"), prov_id)
                cnum = preserve_course_number(_first_present(r, ("course_number", "course_code")))
                pid = _first_present(r, ("program_id", "program_code"))
                sid = _first_present(r, ("source_id",))
                surl = _first_present(
                    r, ("source_url", "url"), sources_by_id.get(sid, {}).get("url", "")
                )
                v_at = _first_present(
                    r,
                    ("last_verified_at", "verified_at"),
                    sources_by_id.get(sid, {}).get("last_verified_at", ""),
                )
                prov_by_record[rec_id] = {"source_id": sid, "source_url": surl, "last_verified_at": v_at}
                cur.execute(
                    """
                    INSERT OR REPLACE INTO provenance_by_row
                    (provenance_id, table_name, record_id, course_number, program_id,
                     source_id, source_url, extraction_method, last_verified_at, confidence_note, raw_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        prov_id,
                        _first_present(r, ("table_name", "source_table")),
                        rec_id,
                        cnum,
                        pid,
                        sid,
                        surl,
                        _first_present(r, ("extraction_method", "method")),
                        v_at,
                        _first_present(r, ("confidence_note", "notes")),
                        json.dumps(r, ensure_ascii=False),
                    ),
                )

            # 5. Academic plans, requirement groups, and plan_course_requirements
            plans_by_program: set[str] = set()
            for idx, r in enumerate(self._read_csv_rows(csv_blobs.get("academic_plans.csv", ""))):
                pl_id = _first_present(r, ("plan_id", "id"), f"plan_{idx+1}")
                pid = _first_present(r, ("program_id", "program_code"))
                if pid:
                    plans_by_program.add(pid)
                cur.execute(
                    """
                    INSERT OR REPLACE INTO academic_plans
                    (plan_id, program_id, plan_name_ar, plan_name_en, cohort_year, total_credits,
                     is_complete_plan, source_url, last_verified_at, raw_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        pl_id,
                        pid,
                        _first_present(r, ("plan_name_ar", "name_ar", "title_ar")),
                        _first_present(r, ("plan_name_en", "name_en", "title_en")),
                        _first_present(r, ("cohort_year", "catalog_year", "year")),
                        _parse_float(_first_present(r, ("total_credits", "required_credits"))),
                        1 if _first_present(r, ("is_complete_plan", "complete")).lower() == "true" else 0,
                        _first_present(r, ("source_url", "url")),
                        _first_present(r, ("last_verified_at", "verified_at")),
                        json.dumps(r, ensure_ascii=False),
                    ),
                )

            for idx, r in enumerate(self._read_csv_rows(csv_blobs.get("requirement_groups.csv", ""))):
                gid = _first_present(r, ("group_id", "id"), f"grp_{idx+1}")
                cur.execute(
                    """
                    INSERT OR REPLACE INTO requirement_groups
                    (group_id, plan_id, program_id, group_name_ar, group_name_en,
                     required_credits, category_type, raw_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        gid,
                        _first_present(r, ("plan_id",)),
                        _first_present(r, ("program_id", "program_code")),
                        _first_present(r, ("group_name_ar", "name_ar")),
                        _first_present(r, ("group_name_en", "name_en")),
                        _parse_float(_first_present(r, ("required_credits", "credits"))),
                        _first_present(r, ("category_type", "type")),
                        json.dumps(r, ensure_ascii=False),
                    ),
                )

            pcr_rows = self._read_csv_rows(csv_blobs.get("plan_course_requirements.csv", ""))
            pcr_programs: set[str] = set()
            for idx, r in enumerate(pcr_rows):
                req_id = _first_present(r, ("req_row_id", "row_id", "id"), f"pcr_{idx+1}")
                pid = _first_present(r, ("program_id", "program_code", "department_id"))
                cnum = preserve_course_number(_first_present(r, ("course_number", "course_code")))
                req_type = _first_present(
                    r, ("requirement_type", "status", "requirement_status", "label"), "recommended"
                )
                if pid:
                    pcr_programs.add(pid)
                # CRITICAL RULE: plan_course_requirements.csv rows labeled 'recommended' are NOT
                # evidence that every course is mandatory.
                is_mandatory_proven = (
                    1
                    if req_type.lower() in {"mandatory_verified", "compulsory_verified"}
                    else 0
                )
                cur.execute(
                    """
                    INSERT OR REPLACE INTO plan_course_requirements
                    (req_row_id, plan_id, program_id, group_id, course_number, requirement_type,
                     is_mandatory_proven, recommended_year, recommended_semester, credit_hours,
                     notes, source_url, raw_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        req_id,
                        _first_present(r, ("plan_id",)),
                        pid,
                        _first_present(r, ("group_id",)),
                        cnum,
                        req_type,
                        is_mandatory_proven,
                        _parse_int(_first_present(r, ("recommended_year", "study_year", "year"))),
                        _parse_int(_first_present(r, ("recommended_semester", "semester", "term"))),
                        _parse_float(_first_present(r, ("credit_hours", "credits"))),
                        _first_present(r, ("notes", "caveat")),
                        _first_present(r, ("source_url", "url")),
                        json.dumps(r, ensure_ascii=False),
                    ),
                )

            # 6. Prerequisite Rules (964 rows: 912 parsed, 40 raw_only, 12 ambiguous)
            prereq_rows = self._read_csv_rows(csv_blobs.get("prerequisite_rules.csv", ""))
            prereq_programs: set[str] = set()
            parse_status_counts: Dict[str, int] = {"parsed": 0, "raw_only": 0, "ambiguous": 0}
            for idx, r in enumerate(prereq_rows):
                rule_id = _first_present(r, ("rule_id", "row_id", "id"), f"rule_{idx+1}")
                pid = _first_present(r, ("program_id", "program_code", "department_id"))
                cnum = preserve_course_number(_first_present(r, ("course_number", "course_code")))
                rel_type = _first_present(
                    r, ("relation_type", "rule_type", "type"), "prerequisite"
                ).lower()
                if "coreq" in rel_type or "متزامن" in rel_type:
                    rel_type = "corequisite"
                else:
                    rel_type = "prerequisite"

                p_status = _first_present(
                    r, ("parse_status", "status", "parsing_status"), "raw_only"
                ).lower()
                if p_status not in {"parsed", "raw_only", "ambiguous"}:
                    p_status = "raw_only"
                parse_status_counts[p_status] = parse_status_counts.get(p_status, 0) + 1

                raw_text = _first_present(
                    r,
                    ("raw_prerequisite_text", "prerequisite_text", "raw_text", "rule_text"),
                )
                expr_json = _build_default_expression_from_row(r, p_status)
                target_codes = _extract_7digit_courses(raw_text)
                explicit_prereq = preserve_course_number(
                    _first_present(
                        r,
                        (
                            "prerequisite_course_number",
                            "prereq_course_number",
                            "required_course_number",
                        ),
                    )
                )
                if explicit_prereq and explicit_prereq not in target_codes:
                    target_codes.insert(0, explicit_prereq)

                lowered_raw = raw_text.lower()
                has_special = int(
                    any(
                        kw in lowered_raw
                        for kw in (
                            "permission",
                            "department",
                            "approval",
                            "standing",
                            "credit",
                            "hours",
                            "موافقة",
                            "قسم",
                            "ساعة",
                            "ساعات",
                            "مستوى",
                        )
                    )
                )
                if pid:
                    prereq_programs.add(pid)
                cur.execute(
                    """
                    INSERT OR REPLACE INTO prerequisite_rules
                    (rule_id, program_id, course_number, relation_type, parse_status,
                     parsed_expression_json, raw_prerequisite_text, target_course_numbers_json,
                     has_special_condition, source_id, source_url, raw_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        rule_id,
                        pid,
                        cnum,
                        rel_type,
                        p_status,
                        expr_json,
                        raw_text,
                        json.dumps(target_codes),
                        has_special,
                        _first_present(r, ("source_id",)),
                        _first_present(r, ("source_url", "url")),
                        json.dumps(r, ensure_ascii=False),
                    ),
                )

            # 7. Public Catalog Layer: courses_master_official_only.csv
            cmo_rows = self._read_csv_rows(csv_blobs.get("courses_master_official_only.csv", ""))
            distinct_courses: set[str] = set()
            cmo_programs: set[str] = set()
            for idx, r in enumerate(cmo_rows):
                row_id = _first_present(r, ("row_id", "master_row_id", "record_id", "id"), f"cmo_{idx+1}")
                cnum = preserve_course_number(
                    _first_present(r, ("course_number", "course_code", "code"))
                )
                pid = _first_present(r, ("program_id", "program_code", "department_id"))
                did = _first_present(r, ("department_id", "department_code"))
                fid = _first_present(r, ("faculty_id", "faculty_code"))
                title_en = _first_present(r, ("title_en", "course_title_en", "course_name_en", "name_en", "title"))
                title_ar_raw = _first_present(r, ("title_ar", "course_title_ar", "course_name_ar", "name_ar"))
                placeholder_flag = is_placeholder_arabic_title(title_ar_raw, title_en, cnum)
                title_ar_clean = "" if placeholder_flag else title_ar_raw

                credits = _parse_float(_first_present(r, ("credit_hours", "credits", "cr")))
                lec = _parse_float(_first_present(r, ("lecture_hours", "theory_hours")))
                lab = _parse_float(_first_present(r, ("lab_hours", "practical_hours")))
                desc_ar = _first_present(r, ("description_ar", "course_description_ar"))
                desc_en = _first_present(r, ("description_en", "course_description_en", "description"))
                raw_prereq = _first_present(
                    r, ("raw_prerequisite_text", "prerequisite_text", "prerequisites", "prerequisites_en", "prerequisites_ar")
                )
                req_label = _first_present(
                    r, ("requirement_type", "requirement_label", "status"), "catalog_listed"
                )

                prov = prov_by_record.get(row_id, {})
                sid = _first_present(r, ("source_id",), prov.get("source_id", ""))
                surl = _first_present(
                    r,
                    ("source_url", "course_source_url", "official_url", "url"),
                    prov.get("source_url", sources_by_id.get(sid, {}).get("url", "")),
                )
                v_at = _first_present(
                    r,
                    ("last_verified_at", "verified_at"),
                    prov.get(
                        "last_verified_at", sources_by_id.get(sid, {}).get("last_verified_at", "")
                    ),
                )

                has_conflict = int((pid, cnum) in conflict_courses or cnum in conflict_course_codes)
                has_gap = int(cnum in gap_course_codes)

                search_blob = normalize_arabic_for_search(
                    f"{cnum} {pid} {title_ar_clean} {title_en} {desc_ar} {desc_en} {raw_prereq}"
                )

                if cnum:
                    distinct_courses.add(cnum)
                if pid:
                    cmo_programs.add(pid)

                cur.execute(
                    """
                    INSERT OR REPLACE INTO courses_master_official
                    (row_id, course_number, program_id, department_id, faculty_id,
                     title_ar, title_en, is_arabic_placeholder, credit_hours, lecture_hours, lab_hours,
                     description_ar, description_en, raw_prerequisite_text, requirement_Label,
                     source_id, source_url, last_verified_at, has_conflict, has_gap,
                     normalized_search_text, raw_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        row_id,
                        cnum,
                        pid,
                        did,
                        fid,
                        title_ar_clean,
                        title_en,
                        int(placeholder_flag),
                        credits,
                        lec,
                        lab,
                        desc_ar,
                        desc_en,
                        raw_prereq,
                        req_label,
                        sid,
                        surl,
                        v_at,
                        has_conflict,
                        has_gap,
                        search_blob,
                        json.dumps(r, ensure_ascii=False),
                    ),
                )

                try:
                    cur.execute(
                        """
                        INSERT INTO catalog_fts
                        (chunk_id, chunk_type, course_number, program_id, title_original, normalized_text)
                        VALUES (?, 'catalog_row', ?, ?, ?, ?)
                        """,
                        (
                            row_id,
                            cnum,
                            pid,
                            f"{title_ar_clean} | {title_en}".strip(" |"),
                            search_blob,
                        ),
                    )
                except sqlite3.OperationalError:
                    pass

            # 8. Normalized courses.csv layer (preserving placeholder flags)
            for idx, r in enumerate(self._read_csv_rows(csv_blobs.get("courses.csv", ""))):
                crow_id = _first_present(r, ("course_row_id", "row_id", "id"), f"cn_{idx+1}")
                cnum = preserve_course_number(
                    _first_present(r, ("course_number", "course_code", "code"))
                )
                pid = _first_present(r, ("program_id", "program_code"))
                title_en = _first_present(r, ("title_en", "course_title_en", "name_en"))
                title_ar_raw = _first_present(r, ("title_ar", "course_title_ar", "name_ar"))
                is_ph = is_placeholder_arabic_title(title_ar_raw, title_en, cnum)
                if cnum:
                    distinct_courses.add(cnum)
                cur.execute(
                    """
                    INSERT OR REPLACE INTO courses_normalized
                    (course_row_id, course_number, program_id, title_ar_raw, title_ar_official,
                     is_arabic_placeholder, title_en, credit_hours, source_url, last_verified_at, raw_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        crow_id,
                        cnum,
                        pid,
                        title_ar_raw,
                        "" if is_ph else title_ar_raw,
                        int(is_ph),
                        title_en,
                        _parse_float(_first_present(r, ("credit_hours", "credits"))),
                        _first_present(r, ("source_url", "url")),
                        _first_present(r, ("last_verified_at", "verified_at")),
                        json.dumps(r, ensure_ascii=False),
                    ),
                )

            # 9. Programs (25 represented program/department entries)
            prog_rows = self._read_csv_rows(csv_blobs.get("programs.csv", ""))
            for idx, r in enumerate(prog_rows):
                pid = _first_present(
                    r, ("program_id", "program_code", "department_id", "id"), f"prog_{idx+1}"
                )
                pcode = _first_present(r, ("program_code", "code", "program_id"), pid)
                name_ar = _first_present(r, ("name_ar", "program_name_ar", "title_ar"))
                name_en = _first_present(r, ("name_en", "program_name_en", "title_en", "name"))

                # Detect MED departmental listing vs. official MD plan
                is_med_dept = int(
                    "med" in pid.lower()
                    or "med" in pcode.lower()
                    or "departmental listing" in json.dumps(r).lower()
                )
                explicit_ev = _first_present(r, ("evidence_level", "planning_tier"), "").lower()
                if explicit_ev in {"verified_planning", "partial_planning", "catalog_only"}:
                    ev_level = explicit_ev
                elif is_med_dept:
                    ev_level = "catalog_only"
                elif pid in prereq_programs and pid in pcr_programs:
                    ev_level = "partial_planning" if gap_programs.get(pid, 0) > 0 else "verified_planning"
                elif pid in pcr_programs or pid in prereq_programs:
                    ev_level = "partial_planning"
                else:
                    ev_level = "catalog_only"

                caveat_ar = _first_present(r, ("caveat_note_ar", "notes_ar"))
                caveat_en = _first_present(r, ("caveat_note_en", "notes_en", "notes"))
                if is_med_dept and not caveat_en:
                    caveat_en = (
                        "Departmental course listing only (MED) — NOT a verified official MD degree plan."
                    )
                    caveat_ar = (
                        "قائمة مساقات قسمية فقط (MED) — وليست خطة دراسية رسمية معتمدة لبرنامج دكتور في الطب (MD)."
                    )

                cur.execute(
                    """
                    INSERT OR REPLACE INTO programs
                    (program_id, program_code, department_id, faculty_id, name_ar, name_en,
                     degree_level, evidence_level, is_departmental_listing_only,
                     total_credits_reported, caveat_note_ar, caveat_note_en, source_url, last_verified_at, raw_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        pid,
                        pcode,
                        _first_present(r, ("department_id", "department_code")),
                        _first_present(r, ("faculty_id", "faculty_code")),
                        name_ar,
                        name_en,
                        _first_present(r, ("degree_level", "degree", "level"), "Bachelor"),
                        ev_level,
                        is_med_dept,
                        _parse_float(_first_present(r, ("total_credits", "required_credits"))),
                        caveat_ar,
                        caveat_en,
                        _first_present(r, ("source_url", "url")),
                        _first_present(r, ("last_verified_at", "verified_at")),
                        json.dumps(r, ensure_ascii=False),
                    ),
                )

            observed_diagnostics = {
                "program_course_records": len(cmo_rows),
                "distinct_course_numbers": len(distinct_courses),
                "represented_programs_departments": len(prog_rows),
                "website_conflicts": len(conflict_rows),
                "data_gaps": len(gap_rows),
                "prerequisite_rules_total": len(prereq_rows),
                "prerequisite_rules_parsed": parse_status_counts.get("parsed", 0),
                "prerequisite_rules_raw_only": parse_status_counts.get("raw_only", 0),
                "prerequisite_rules_ambiguous": parse_status_counts.get("ambiguous", 0),
                "plan_course_requirements_recommended_rows": len(pcr_rows),
            }

            diagnostics_payload = {
                "dataset_loaded": True,
                "source_location": source_location,
                "ingested_at": now_iso,
                "observed_counts": observed_diagnostics,
                "expected_counts": EXPECTED_DATASET_DIAGNOSTICS,
                "excluded_synthetic_files": ignored_synthetic,
                "excluded_non_policy_documents": ignored_non_policy,
                "readme_excerpt": readme_text[:1200] if readme_text else "",
            }

            cur.execute(
                """
                INSERT OR REPLACE INTO ingestion_diagnostics (key, value_text, updated_at)
                VALUES ('latest_ingestion', ?, ?)
                """,
                (json.dumps(diagnostics_payload, ensure_ascii=False), now_iso),
            )
            conn.commit()
            return diagnostics_payload
        finally:
            conn.close()

    def ingest_verified_policy_pdf(
        self,
        pdf_path: str,
        doc_title: str,
        source_url: str,
        version_label: str = "official",
        effective_policy_date: str = "",
    ) -> Dict[str, Any]:
        """Ingest an official Al-Quds University bylaw/regulation PDF with page metadata.

        Strictly rejects the IEEE hackathon student guide PDF from being indexed as university policy.
        """
        fname = os.path.basename(pdf_path)
        if fname in EXCLUDED_NON_POLICY_DOCUMENTS or "ieee_rag" in fname.lower():
            raise ValueError(
                f"Refusing to ingest '{fname}' as Al-Quds University academic policy: "
                "The IEEE hackathon guide is the project requirements document, NOT university policy."
            )
        if not source_url.strip():
            raise ValueError("Official source_url is required when ingesting university bylaws.")

        try:
            from pypdf import PdfReader  # type: ignore
        except ImportError as exc:
            raise RuntimeError("pypdf is required to extract page text from verified PDFs.") from exc

        reader = PdfReader(pdf_path)
        conn = self._connect()
        inserted = 0
        try:
            cur = conn.cursor()
            for page_idx, page in enumerate(reader.pages, start=1):
                raw_text = (page.extract_text() or "").strip()
                if not raw_text:
                    continue
                chunk_id = f"policy_{Path(fname).stem}_p{page_idx}"
                norm_text = normalize_arabic_for_search(raw_text)
                cur.execute(
                    """
                    INSERT OR REPLACE INTO policy_chunks
                    (chunk_id, doc_title, section_title, page_number, source_url,
                     version_label, effective_policy_date, text_original, text_normalized)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        chunk_id,
                        doc_title,
                        f"Page {page_idx}",
                        page_idx,
                        source_url,
                        version_label,
                        effective_policy_date,
                        raw_text,
                        norm_text,
                    ),
                )
                try:
                    cur.execute(
                        """
                        INSERT INTO catalog_fts
                        (chunk_id, chunk_type, course_number, program_id, title_original, normalized_text)
                        VALUES (?, 'policy_chunk', '', '', ?, ?)
                        """,
                        (chunk_id, f"{doc_title} (p. {page_idx})", norm_text),
                    )
                except sqlite3.OperationalError:
                    pass
                inserted += 1
            conn.commit()
            return {"ingested_pages": inserted, "doc_title": doc_title, "source_url": source_url}
        finally:
            conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest Al-Quds University dataset ZIP or directory into local SQLite + FTS5."
    )
    settings = get_settings()
    parser.add_argument("--zip", default=settings.dataset_zip_path, help="Path to alquds_expanded_dataset(1).zip")
    parser.add_argument("--dir", default=settings.dataset_dir_path, help="Path to extracted dataset directory")
    parser.add_argument("--db", default=settings.sqlite_db_path, help="Path to SQLite database file")
    args = parser.parse_args()

    ingestor = DatasetIngestor(sqlite_path=args.db)
    result = ingestor.ingest_from_zip_or_dir(zip_path=args.zip, dir_path=args.dir)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
