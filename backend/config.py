"""Configuration and verified dataset invariants for Al-Quds AI Academic Advisor."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Dict, List


# Expected diagnostic counts from the Al-Quds expanded dataset (used as import diagnostics,
# never as fabricated records or proof of curriculum completeness).
EXPECTED_DATASET_DIAGNOSTICS: Dict[str, int] = {
    "program_course_records": 1617,
    "distinct_course_numbers": 1099,
    "represented_programs_departments": 25,
    "website_conflicts": 53,
    "data_gaps": 1655,
    "prerequisite_rules_total": 964,
    "prerequisite_rules_parsed": 912,
    "prerequisite_rules_raw_only": 40,
    "prerequisite_rules_ambiguous": 12,
    "plan_course_requirements_recommended_rows": 1617,
}

# Files in alquds_expanded_dataset(1).zip that contain synthetic/generated demo timetables
# and MUST be excluded from factual responses, search indexes, and study planning.
EXCLUDED_SYNTHETIC_FILES: List[str] = [
    "sections.csv",
    "section_meetings.csv",
    "rooms.csv",
]

# Non-policy files that must never be ingested as official Al-Quds University academic bylaws.
EXCLUDED_NON_POLICY_DOCUMENTS: List[str] = [
    "IEEE_RAG_Student_Guide_Academic_Advisor_AR.pdf",
]

# Official Al-Quds University public catalog & plan files inspected on import.
SUPPORTED_DATASET_CSV_FILES: List[str] = [
    "courses_master_official_only.csv",
    "courses_master.csv",
    "courses.csv",
    "programs.csv",
    "academic_plans.csv",
    "plan_course_requirements.csv",
    "prerequisite_rules.csv",
    "sources.csv",
    "provenance_by_row.csv",
    "website_conflicts.csv",
    "data_gaps.csv",
    "departments.csv",
    "faculties.csv",
    "requirement_groups.csv",
    "academic_terms.csv",
    "schema_dictionary.csv",
]


@dataclass(frozen=True)
class Settings:
    """Runtime settings loaded from environment variables with safe local defaults."""

    backend_host: str = field(default_factory=lambda: os.getenv("BACKEND_HOST", "127.0.0.1"))
    backend_port: int = field(default_factory=lambda: int(os.getenv("BACKEND_PORT", "8000")))
    allowed_origins: List[str] = field(
        default_factory=lambda: [
            origin.strip()
            for origin in os.getenv(
                "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
            ).split(",")
            if origin.strip()
        ]
    )

    # Local Ollama settings — backend-only, never exposed directly to browser clients.
    ollama_base_url: str = field(
        default_factory=lambda: os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    )
    ollama_chat_model: str = field(
        default_factory=lambda: os.getenv("OLLAMA_CHAT_MODEL", "qwen2.5:3b").strip()
    )
    ollama_embed_model: str = field(
        default_factory=lambda: os.getenv("OLLAMA_EMBED_MODEL", "bge-m3").strip()
    )
    ollama_timeout_seconds: float = field(
        default_factory=lambda: float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "45"))
    )
    semantic_max_distance: float = field(
        default_factory=lambda: float(os.getenv("SEMANTIC_MAX_DISTANCE", "1.12"))
    )

    # Storage paths
    sqlite_db_path: str = field(
        default_factory=lambda: os.getenv("SQLITE_DB_PATH", "./backend/data/alquds_catalog.db")
    )
    chroma_persist_dir: str = field(
        default_factory=lambda: os.getenv("CHROMA_PERSIST_DIR", "./backend/data/chroma_index")
    )
    dataset_zip_path: str = field(
        default_factory=lambda: os.getenv("DATASET_ZIP_PATH", "./alquds_expanded_dataset(1).zip")
    )
    dataset_dir_path: str = field(
        default_factory=lambda: os.getenv("DATASET_DIR_PATH", "./backend/data/extracted_dataset")
    )
    verified_bylaws_dir: str = field(
        default_factory=lambda: os.getenv("VERIFIED_BYLAWS_DIR", "./backend/data/verified_bylaws")
    )

    # Portal integration settings
    enable_authorized_portal_adapters: bool = field(
        default_factory=lambda: os.getenv("ENABLE_AUTHORIZED_PORTAL_ADAPTERS", "false").lower()
        == "true"
    )
    student_portal_login_url: str = field(
        default_factory=lambda: os.getenv(
            "ALQUDS_STUDENT_PORTAL_LOGIN_URL", "https://student.alquds.edu/en/login"
        )
    )
    lecturer_portal_login_url: str = field(
        default_factory=lambda: os.getenv(
            "ALQUDS_LECTURER_PORTAL_LOGIN_URL", "https://portal.alquds.edu/en/login"
        )
    )
    portal_session_ttl_seconds: int = field(
        default_factory=lambda: int(os.getenv("PORTAL_SESSION_TTL_SECONDS", "900"))
    )


def get_settings() -> Settings:
    """Return a fresh Settings instance from the current environment."""
    return Settings()
