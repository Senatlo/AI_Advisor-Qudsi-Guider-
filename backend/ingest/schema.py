"""SQLite relational schema and FTS5 lexical index for Al-Quds University catalog & provenance."""

from __future__ import annotations

import sqlite3


SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ingestion_diagnostics (
    key TEXT PRIMARY KEY,
    value_text TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS faculties (
    faculty_id TEXT PRIMARY KEY,
    name_ar TEXT,
    name_en TEXT,
    source_url TEXT,
    raw_json TEXT
);

CREATE TABLE IF NOT EXISTS departments (
    department_id TEXT PRIMARY KEY,
    faculty_id TEXT,
    name_ar TEXT,
    name_en TEXT,
    source_url TEXT,
    raw_json TEXT
);

CREATE TABLE IF NOT EXISTS programs (
    program_id TEXT PRIMARY KEY,
    program_code TEXT,
    department_id TEXT,
    faculty_id TEXT,
    name_ar TEXT,
    name_en TEXT,
    degree_level TEXT,
    evidence_level TEXT NOT NULL DEFAULT 'catalog_only',
    is_departmental_listing_only INTEGER NOT NULL DEFAULT 0,
    total_credits_reported REAL,
    caveat_note_ar TEXT,
    caveat_note_en TEXT,
    source_url TEXT,
    last_verified_at TEXT,
    raw_json TEXT
);

-- Public catalog layer: courses_master_official_only.csv (row-level preserved, never deduplicated naively)
CREATE TABLE IF NOT EXISTS courses_master_official (
    row_id TEXT PRIMARY KEY,
    course_number TEXT NOT NULL,
    program_id TEXT,
    department_id TEXT,
    faculty_id TEXT,
    title_ar TEXT,
    title_en TEXT,
    is_arabic_placeholder INTEGER NOT NULL DEFAULT 0,
    credit_hours REAL,
    lecture_hours REAL,
    lab_hours REAL,
    description_ar TEXT,
    description_en TEXT,
    raw_prerequisite_text TEXT,
    requirement_Label TEXT,
    source_id TEXT,
    source_url TEXT,
    last_verified_at TEXT,
    has_conflict INTEGER NOT NULL DEFAULT 0,
    has_gap INTEGER NOT NULL DEFAULT 0,
    normalized_search_text TEXT NOT NULL,
    raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_cmo_course_number ON courses_master_official(course_number);
CREATE INDEX IF NOT EXISTS idx_cmo_program_id ON courses_master_official(program_id);

-- Normalized courses.csv layer (stored separately to preserve row-level distinctions and flag placeholders)
CREATE TABLE IF NOT EXISTS courses_normalized (
    course_row_id TEXT PRIMARY KEY,
    course_number TEXT NOT NULL,
    program_id TEXT,
    title_ar_raw TEXT,
    title_ar_official TEXT,
    is_arabic_placeholder INTEGER NOT NULL DEFAULT 0,
    title_en TEXT,
    credit_hours REAL,
    source_url TEXT,
    last_verified_at TEXT,
    raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_cn_course_number ON courses_normalized(course_number);

CREATE TABLE IF NOT EXISTS academic_plans (
    plan_id TEXT PRIMARY KEY,
    program_id TEXT,
    plan_name_ar TEXT,
    plan_name_en TEXT,
    cohort_year TEXT,
    total_credits REAL,
    is_complete_plan INTEGER NOT NULL DEFAULT 0,
    source_url TEXT,
    last_verified_at TEXT,
    raw_json TEXT
);

CREATE TABLE IF NOT EXISTS requirement_groups (
    group_id TEXT PRIMARY KEY,
    plan_id TEXT,
    program_id TEXT,
    group_name_ar TEXT,
    group_name_en TEXT,
    required_credits REAL,
    category_type TEXT,
    raw_json TEXT
);

-- plan_course_requirements.csv: 1,617 rows labeled 'recommended' (NOT evidence that every course is mandatory)
CREATE TABLE IF NOT EXISTS plan_course_requirements (
    req_row_id TEXT PRIMARY KEY,
    plan_id TEXT,
    program_id TEXT,
    group_id TEXT,
    course_number TEXT NOT NULL,
    requirement_type TEXT NOT NULL,
    is_mandatory_proven INTEGER NOT NULL DEFAULT 0,
    recommended_year INTEGER,
    recommended_semester INTEGER,
    credit_hours REAL,
    notes TEXT,
    source_url TEXT,
    raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_pcr_program ON plan_course_requirements(program_id);
CREATE INDEX IF NOT EXISTS idx_pcr_course ON plan_course_requirements(course_number);

-- prerequisite_rules.csv: 964 rows (912 parsed, 40 raw_only, 12 ambiguous)
CREATE TABLE IF NOT EXISTS prerequisite_rules (
    rule_id TEXT PRIMARY KEY,
    program_id TEXT,
    course_number TEXT NOT NULL,
    relation_type TEXT NOT NULL DEFAULT 'prerequisite',
    parse_status TEXT NOT NULL,
    parsed_expression_json TEXT,
    raw_prerequisite_text TEXT,
    target_course_numbers_json TEXT,
    has_special_condition INTEGER NOT NULL DEFAULT 0,
    source_id TEXT,
    source_url TEXT,
    raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_pr_course ON prerequisite_rules(course_number);
CREATE INDEX IF NOT EXISTS idx_pr_program_course ON prerequisite_rules(program_id, course_number);

CREATE TABLE IF NOT EXISTS sources (
    source_id TEXT PRIMARY KEY,
    source_type TEXT,
    title TEXT,
    url TEXT,
    domain TEXT,
    last_verified_at TEXT,
    effective_policy_date TEXT,
    notes TEXT,
    raw_json TEXT
);

CREATE TABLE IF NOT EXISTS provenance_by_row (
    provenance_id TEXT PRIMARY KEY,
    table_name TEXT,
    record_id TEXT,
    course_number TEXT,
    program_id TEXT,
    source_id TEXT,
    source_url TEXT,
    extraction_method TEXT,
    last_verified_at TEXT,
    confidence_note TEXT,
    raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_prov_course ON provenance_by_row(course_number);

CREATE TABLE IF NOT EXISTS website_conflicts (
    conflict_id TEXT PRIMARY KEY,
    course_number TEXT,
    program_id TEXT,
    field_name TEXT,
    value_source_a TEXT,
    value_source_b TEXT,
    source_a_url TEXT,
    source_b_url TEXT,
    conflict_type TEXT,
    severity TEXT,
    description TEXT,
    resolution_status TEXT NOT NULL DEFAULT 'unresolved_in_source',
    raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_wc_course ON website_conflicts(course_number);
CREATE INDEX IF NOT EXISTS idx_wc_program ON website_conflicts(program_id);

CREATE TABLE IF NOT EXISTS data_gaps (
    gap_id TEXT PRIMARY KEY,
    program_id TEXT,
    course_number TEXT,
    entity_type TEXT,
    missing_field TEXT,
    gap_category TEXT,
    impact_on_advising TEXT,
    description TEXT,
    source_url TEXT,
    raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_dg_program ON data_gaps(program_id);
CREATE INDEX IF NOT EXISTS idx_dg_course ON data_gaps(course_number);

-- Official university bylaws/regulations only (excludes IEEE hackathon guide)
CREATE TABLE IF NOT EXISTS policy_chunks (
    chunk_id TEXT PRIMARY KEY,
    doc_title TEXT NOT NULL,
    section_title TEXT,
    page_number INTEGER,
    source_url TEXT NOT NULL,
    version_label TEXT,
    effective_policy_date TEXT,
    text_original TEXT NOT NULL,
    text_normalized TEXT NOT NULL
);
"""

FTS5_SQL = """
CREATE VIRTUAL TABLE IF NOT EXISTS catalog_fts USING fts5(
    chunk_id UNINDEXED,
    chunk_type UNINDEXED,
    course_number,
    program_id,
    title_original,
    normalized_text
);
"""


def init_db(conn: sqlite3.Connection) -> None:
    """Initialize all relational tables and FTS5 virtual table."""
    conn.executescript(SCHEMA_SQL)
    try:
        conn.executescript(FTS5_SQL)
    except sqlite3.OperationalError:
        # Fallback if SQLite build lacks FTS5 (Python 3.10+ standard builds include FTS5)
        pass
    conn.commit()
