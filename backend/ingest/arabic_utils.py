"""Arabic normalization, course code preservation, and placeholder detection utilities.

Retains original text for citations and user display while producing normalized
forms for lexical (SQLite FTS5 / BM25) and hybrid retrieval.
"""

from __future__ import annotations

import re
from typing import Optional

# Diacritics (Tashkeel) and Tatweel (Kashida)
_ARABIC_DIACRITICS_RE = re.compile(r"[\u0617-\u061A\u064B-\u0652\u0670\u0640]")
_WHITESPACE_RE = re.compile(r"\s+")
_SEVEN_DIGIT_COURSE_RE = re.compile(r"\b(\d{7})\b")

# Known placeholder patterns that appear in normalized courses.csv when an official
# Arabic title was not available in the source catalog.
_PLACEHOLDER_PATTERNS = (
    re.compile(r"^\[?\s*(missing|placeholder|untranslated|todo|n/?a|none|null|unknown)\b", re.I),
    re.compile(r"^(غير متوفر|بدون عنوان|ترجمة غير رسمية|placeholder|missing_ar)", re.I),
    re.compile(r"^course\s+\d{7}$", re.I),
)


def normalize_arabic_for_search(text: Optional[str]) -> str:
    """Normalize Arabic and English text for lexical search without mutating original citation text.

    - Strips Arabic tashkeel (diacritics) and tatweel.
    - Normalizes Alef variants (أ, إ, آ, ٱ) -> ا
    - Normalizes Teh Marbuta (ة) -> ه
    - Normalizes Alef Maksura (ى) -> ي
    - Normalizes Hamza on Waw/Yeh (ؤ -> و, ئ -> ي)
    - Lowercases Latin characters and collapses whitespace.
    """
    if not text:
        return ""
    cleaned = _ARABIC_DIACRITICS_RE.sub("", str(text))
    cleaned = (
        cleaned.replace("أ", "ا")
        .replace("إ", "ا")
        .replace("آ", "ا")
        .replace("ٱ", "ا")
        .replace("ة", "ه")
        .replace("ى", "ي")
        .replace("ؤ", "و")
        .replace("ئ", "ي")
    )
    cleaned = cleaned.lower()
    cleaned = _WHITESPACE_RE.sub(" ", cleaned).strip()
    return cleaned


def preserve_course_number(raw_code: object) -> str:
    """Preserve leading zeros on 7-digit Al-Quds course numbers as strings.

    Never casts course numbers to int. If a purely numeric string of length < 7
    was accidentally stripped of leading zeros upstream, pads to 7 digits only when
    explicitly numeric; otherwise preserves the exact trimmed string token.
    """
    if raw_code is None:
        return ""
    token = str(raw_code).strip()
    if not token:
        return ""
    # Guard against float-formatted strings like '302101.0'
    if token.endswith(".0") and token[:-2].isdigit():
        token = token[:-2]
    if token.isdigit() and len(token) < 7:
        return token.zfill(7)
    return token


def extract_course_numbers_from_query(query: str) -> list[str]:
    """Extract all 7-digit course number tokens from a user query in order."""
    if not query:
        return []
    seen: list[str] = []
    for match in _SEVEN_DIGIT_COURSE_RE.findall(query):
        if match not in seen:
            seen.append(match)
    return seen


def is_placeholder_arabic_title(
    title_ar: Optional[str],
    title_en: Optional[str] = None,
    course_number: Optional[str] = None,
) -> bool:
    """Detect whether an Arabic title value is a synthetic placeholder rather than an official title.

    The normalized courses.csv may include placeholders for missing Arabic names;
    such placeholders must never be displayed as official Arabic course translations.
    """
    if not title_ar:
        return True
    cleaned = title_ar.strip()
    if not cleaned or cleaned in {"-", "—", "N/A", "NA", "null", "None", "?"}:
        return True
    for pattern in _PLACEHOLDER_PATTERNS:
        if pattern.search(cleaned):
            return True
    # If the Arabic field is identical to the English title (and contains no Arabic script)
    has_arabic_chars = any("\u0600" <= ch <= "\u06FF" for ch in cleaned)
    if not has_arabic_chars:
        return True
    if course_number and cleaned == course_number.strip():
        return True
    return False
