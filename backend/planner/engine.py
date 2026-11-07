"""Deterministic study planner and prerequisite/corequisite rule evaluator.

Never delegates numeric credit math or prerequisite satisfaction decisions to an LLM.
Distinguishes:
- prerequisite vs. corequisite
- completed vs. in_progress vs. failed_not_passed vs. desired
- unambiguous AND/OR boolean AST vs. raw_only / ambiguous / special-condition rules
- validated non-double-counted completed credits vs. unresolved/conflicting credits
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from backend.ingest.arabic_utils import preserve_course_number

READINESS_STATES = (
    "requirements_met",
    "missing_prerequisite",
    "corequisite_condition",
    "needs_verification",
)

OFFICIAL_APPROVAL_DISCLAIMER_EN = (
    "Requirements met reflects catalog prerequisite logic only — it is NOT official university "
    "approval to register or proof of current semester offering."
)
OFFICIAL_APPROVAL_DISCLAIMER_AR = (
    "استيفاء المتطلبات يعكس فحص المتطلبات السابقة حسب الدليل فقط — ولا يُعد موافقة رسمية على التسجيل "
    "أو ضماناً لطرح المساق في الفصل الحالي."
)


@dataclass
class StudentCourseRecord:
    course_number: str
    status: str  # 'completed' | 'in_progress' | 'failed_not_passed' | 'desired'
    is_repeat: bool = False
    is_transfer_or_substitution: bool = False


@dataclass
class CourseEvaluationResult:
    course_number: str
    title_ar: str
    title_en: str
    credit_hours: Optional[float]
    readiness_state: str
    requirement_label: str
    is_mandatory_proven: bool
    reasons_en: List[str] = field(default_factory=list)
    reasons_ar: List[str] = field(default_factory=list)
    missing_courses: List[str] = field(default_factory=list)
    corequisite_courses: List[str] = field(default_factory=list)
    raw_prerequisite_text: str = ""
    parse_status: str = "none"
    has_conflict: bool = False
    source_url: str = ""
    last_verified_at: str = ""
    official_approval_disclaimer_en: str = OFFICIAL_APPROVAL_DISCLAIMER_EN
    official_approval_disclaimer_ar: str = OFFICIAL_APPROVAL_DISCLAIMER_AR


def _eval_boolean_ast(
    node: Dict[str, Any],
    satisfied_set: Set[str],
) -> Tuple[Optional[bool], List[str]]:
    """Evaluate an unambiguous boolean AST node against a set of satisfied course numbers.

    Returns (is_satisfied, missing_course_numbers). If the AST node is malformed or
    contains unknown node types, returns (None, []) so the caller marks needs_verification.
    """
    node_type = str(node.get("type", "")).upper()
    if node_type == "COURSE":
        code = preserve_course_number(node.get("course_number", ""))
        if not code or len(code) != 7:
            return None, []
        if code in satisfied_set:
            return True, []
        return False, [code]

    children = node.get("children")
    if not isinstance(children, list) or not children:
        return None, []

    if node_type == "AND":
        all_missing: List[str] = []
        for child in children:
            if not isinstance(child, dict):
                return None, []
            ok, missing = _eval_boolean_ast(child, satisfied_set)
            if ok is None:
                return None, []
            if not ok:
                for m in missing:
                    if m not in all_missing:
                        all_missing.append(m)
        return (len(all_missing) == 0), all_missing

    if node_type == "OR":
        branch_missing: List[str] = []
        for child in children:
            if not isinstance(child, dict):
                return None, []
            ok, missing = _eval_boolean_ast(child, satisfied_set)
            if ok is None:
                return None, []
            if ok:
                return True, []
            for m in missing:
                if m not in branch_missing:
                    branch_missing.append(m)
        return False, branch_missing

    return None, []


class DeterministicPlannerEngine:
    """Evaluates student progress and target course readiness using SQLite catalog & rule records."""

    def __init__(self, sqlite_path: str) -> None:
        self.sqlite_path = sqlite_path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.sqlite_path)
        conn.row_factory = sqlite3.Row
        return conn

    def evaluate_plan(
        self,
        program_id: str,
        student_courses: List[Dict[str, Any]],
        target_courses: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Run deterministic prerequisite/corequisite and credit evaluation for a program."""
        conn = self._connect()
        try:
            cur = conn.cursor()
            prog_row = cur.execute(
                "SELECT * FROM programs WHERE program_id = ? OR program_code = ? LIMIT 1",
                (program_id, program_id),
            ).fetchone()

            resolved_program_id = prog_row["program_id"] if prog_row else program_id
            evidence_level = prog_row["evidence_level"] if prog_row else "catalog_only"
            is_dept_listing = bool(prog_row["is_departmental_listing_only"]) if prog_row else (
                "med" in program_id.lower()
            )

            # Classify student records
            completed_codes: Set[str] = set()
            in_progress_codes: Set[str] = set()
            failed_codes: Set[str] = set()
            desired_codes: Set[str] = set()
            repeated_codes: Set[str] = set()
            transfer_or_sub_codes: Set[str] = set()
            duplicate_completed_inputs: List[str] = []

            for item in student_courses:
                code = preserve_course_number(item.get("course_number", ""))
                if not code:
                    continue
                status = str(item.get("status", "desired")).lower().strip()
                if bool(item.get("is_repeat")):
                    repeated_codes.add(code)
                if bool(item.get("is_transfer_or_substitution")):
                    transfer_or_sub_codes.add(code)

                if status == "completed":
                    if code in completed_codes:
                        if code not in duplicate_completed_inputs:
                            duplicate_completed_inputs.append(code)
                    completed_codes.add(code)
                elif status == "in_progress":
                    in_progress_codes.add(code)
                elif status in {"failed", "failed_not_passed", "not_passed"}:
                    failed_codes.add(code)
                elif status == "desired":
                    desired_codes.add(code)

            # Failed courses that were not subsequently completed are explicitly NOT satisfied
            effective_completed = completed_codes - (failed_codes - completed_codes)

            # Calculate known completed credits with NO double counting and only for validated courses
            validated_completed_credits = 0.0
            unverified_completed_courses: List[Dict[str, Any]] = []
            counted_credit_courses: List[Dict[str, Any]] = []

            for code in sorted(effective_completed):
                if code in transfer_or_sub_codes:
                    unverified_completed_courses.append(
                        {
                            "course_number": code,
                            "reason_en": "Transfer or course substitution requires official faculty committee verification.",
                            "reason_ar": "معادلة المساقات أو المساقات البديلة تتطلب تحققاً رسمياً من لجنة الكلية.",
                        }
                    )
                    continue

                catalog_rows = cur.execute(
                    """
                    SELECT * FROM courses_master_official
                    WHERE course_number = ? AND (program_id = ? OR ? = '')
                    """,
                    (code, resolved_program_id, resolved_program_id),
                ).fetchall()
                if not catalog_rows:
                    catalog_rows = cur.execute(
                        "SELECT * FROM courses_master_official WHERE course_number = ?",
                        (code,),
                    ).fetchall()

                if not catalog_rows:
                    unverified_completed_courses.append(
                        {
                            "course_number": code,
                            "reason_en": "Course code not found in official Al-Quds catalog table.",
                            "reason_ar": "رقم المساق غير موجود في جدول دليل جامعة القدس الرسمي.",
                        }
                    )
                    continue

                # Check if rows disagree on credit_hours or have a recorded website conflict
                distinct_credits = {
                    float(r["credit_hours"])
                    for r in catalog_rows
                    if r["credit_hours"] is not None
                }
                has_row_conflict = any(bool(r["has_conflict"]) for r in catalog_rows)
                if len(distinct_credits) != 1 or has_row_conflict:
                    unverified_completed_courses.append(
                        {
                            "course_number": code,
                            "reason_en": "Credit value has a recorded website conflict or missing/inconsistent credit hours across rows.",
                            "reason_ar": "عدد الساعات المعتمدة يحتوي على تعارض مسجل في الموقع أو عدم تطابق بين السجلات.",
                        }
                    )
                    continue

                credit_val = next(iter(distinct_credits))
                validated_completed_credits += credit_val
                counted_credit_courses.append(
                    {
                        "course_number": code,
                        "title_ar": catalog_rows[0]["title_ar"] or "",
                        "title_en": catalog_rows[0]["title_en"] or "",
                        "credit_hours": credit_val,
                    }
                )

            # Determine which courses to evaluate
            eval_codes: List[str] = []
            for code in (target_courses or []) + sorted(desired_codes):
                norm_code = preserve_course_number(code)
                if norm_code and norm_code not in eval_codes:
                    eval_codes.append(norm_code)

            if not eval_codes and resolved_program_id:
                # If no explicit desired list was passed, evaluate up to 12 program courses not yet completed
                prog_course_rows = cur.execute(
                    """
                    SELECT DISTINCT course_number FROM courses_master_official
                    WHERE program_id = ? ORDER BY course_number LIMIT 20
                    """,
                    (resolved_program_id,),
                ).fetchall()
                for r in prog_course_rows:
                    cnum = r["course_number"]
                    if cnum not in effective_completed and cnum not in eval_codes:
                        eval_codes.append(cnum)
                    if len(eval_codes) >= 12:
                        break

            evaluations: List[Dict[str, Any]] = []
            suggestions: List[Dict[str, Any]] = []

            for code in eval_codes:
                ev = self._evaluate_single_course(
                    cur=cur,
                    program_id=resolved_program_id,
                    course_number=code,
                    completed_codes=effective_completed,
                    in_progress_codes=in_progress_codes,
                    failed_codes=failed_codes,
                    desired_codes=desired_codes,
                    repeated_codes=repeated_codes,
                    transfer_or_sub_codes=transfer_or_sub_codes,
                )
                ev_dict = {
                    "course_number": ev.course_number,
                    "title_ar": ev.title_ar,
                    "title_en": ev.title_en,
                    "credit_hours": ev.credit_hours,
                    "readiness_state": ev.readiness_state,
                    "requirement_label": ev.requirement_label,
                    "is_mandatory_proven": ev.is_mandatory_proven,
                    "reasons_en": ev.reasons_en,
                    "reasons_ar": ev.reasons_ar,
                    "missing_courses": ev.missing_courses,
                    "corequisite_courses": ev.corequisite_courses,
                    "raw_prerequisite_text": ev.raw_prerequisite_text,
                    "parse_status": ev.parse_status,
                    "has_conflict": ev.has_conflict,
                    "source_url": ev.source_url,
                    "last_verified_at": ev.last_verified_at,
                    "official_approval_disclaimer_en": ev.official_approval_disclaimer_en,
                    "official_approval_disclaimer_ar": ev.official_approval_disclaimer_ar,
                }
                evaluations.append(ev_dict)
                if ev.readiness_state in {"requirements_met", "corequisite_condition"}:
                    suggestions.append(
                        {
                            "course_number": ev.course_number,
                            "title_ar": ev.title_ar,
                            "title_en": ev.title_en,
                            "credit_hours": ev.credit_hours,
                            "readiness_state": ev.readiness_state,
                            "suggestion_disclaimer_en": (
                                "Suggested study candidate based on catalog prerequisites only — "
                                "NOT a real semester schedule, instructor assignment, room, or seat guarantee."
                            ),
                            "suggestion_disclaimer_ar": (
                                "مقترح إرشادي بناءً على المتطلبات السابقة في الدليل فقط — وليس جدولاً دراسياً فعلياً "
                                "أو ضماناً لطرح المساق أو توفر المقاعد أو اسم المحاضر."
                            ),
                        }
                    )

            return {
                "program_id": resolved_program_id,
                "program_name_ar": prog_row["name_ar"] if prog_row else "",
                "program_name_en": prog_row["name_en"] if prog_row else resolved_program_id,
                "evidence_level": evidence_level,
                "is_departmental_listing_only": is_dept_listing,
                "degree_audit_guaranteed": False,
                "official_graduation_percentage": None,
                "degree_audit_refusal_reason_en": (
                    "Official graduation percentage and guaranteed degree audit are disabled: "
                    "plan_course_requirements.csv marks 1,617 rows as 'recommended' (not proof of mandatory "
                    "status), and cohort-specific elective/substitution rules require official registrar verification."
                ),
                "degree_audit_refusal_reason_ar": (
                    "تم إيقاف حساب نسبة التخرج الرسمية والتدقيق النهائي المضمون للخطة: "
                    "ملف متطلبات الخطة يصنف 1,617 سجلاً كمساقات مقترحة (recommended) وليس كدليل قاطع على الإلزام، "
                    "كما أن قواعد المساقات الاختيارية والمعادلات حسب الدفعة تتطلب تدقيق دائرة القبول والتسجيل."
                ),
                "credits_summary": {
                    "validated_completed_credits": validated_completed_credits,
                    "counted_courses": counted_credit_courses,
                    "unverified_or_excluded_courses": unverified_completed_courses,
                    "duplicate_completed_inputs_ignored": duplicate_completed_inputs,
                    "repeated_courses_flagged": sorted(repeated_codes),
                    "transfer_or_substitution_flagged": sorted(transfer_or_sub_codes),
                },
                "course_evaluations": evaluations,
                "next_semester_suggestions": suggestions,
            }
        finally:
            conn.close()

    def _evaluate_single_course(
        self,
        cur: sqlite3.Cursor,
        program_id: str,
        course_number: str,
        completed_codes: Set[str],
        in_progress_codes: Set[str],
        failed_codes: Set[str],
        desired_codes: Set[str],
        repeated_codes: Set[str],
        transfer_or_sub_codes: Set[str],
    ) -> CourseEvaluationResult:
        # Look up program-specific catalog rows first, then fallback to general official rows
        cmo_rows = cur.execute(
            """
            SELECT * FROM courses_master_official
            WHERE course_number = ? AND (program_id = ? OR ? = '')
            """,
            (course_number, program_id, program_id),
        ).fetchall()
        if not cmo_rows:
            cmo_rows = cur.execute(
                "SELECT * FROM courses_master_official WHERE course_number = ?",
                (course_number,),
            ).fetchall()

        if not cmo_rows:
            return CourseEvaluationResult(
                course_number=course_number,
                title_ar="",
                title_en="Unknown / Unindexed Course",
                credit_hours=None,
                readiness_state="needs_verification",
                requirement_label="unverified",
                is_mandatory_proven=False,
                reasons_en=[
                    f"Course {course_number} is not present in courses_master_official_only.csv."
                ],
                reasons_ar=[
                    f"المساق {course_number} غير موجود في سجل المساقات الرسمية المعتمدة."
                ],
            )

        primary = cmo_rows[0]
        title_ar = "" if bool(primary["is_arabic_placeholder"]) else (primary["title_ar"] or "")
        title_en = primary["title_en"] or ""
        credits = primary["credit_hours"]
        raw_prereq_catalog = (primary["raw_prerequisite_text"] or "").strip()
        source_url = primary["source_url"] or ""
        last_verified_at = primary["last_verified_at"] or ""

        # Check plan_course_requirements for requirement_type label
        pcr_row = cur.execute(
            """
            SELECT * FROM plan_course_requirements
            WHERE course_number = ? AND (program_id = ? OR ? = '')
            LIMIT 1
            """,
            (course_number, program_id, program_id),
        ).fetchone()
        req_label = (
            pcr_row["requirement_type"]
            if pcr_row and pcr_row["requirement_type"]
            else (primary["requirement_Label"] or "catalog_listed")
        )
        is_mandatory_proven = bool(pcr_row["is_mandatory_proven"]) if pcr_row else False

        # Check website conflicts on this course
        conflicts = cur.execute(
            """
            SELECT * FROM website_conflicts
            WHERE course_number = ? AND (program_id = ? OR program_id = '' OR ? = '')
            """,
            (course_number, program_id, program_id),
        ).fetchall()
        has_conflict = bool(primary["has_conflict"]) or len(conflicts) > 0

        reasons_en: List[str] = []
        reasons_ar: List[str] = []

        # Check if multiple catalog rows conflict on prerequisite text or credits
        distinct_prereq_texts = {
            (r["raw_prerequisite_text"] or "").strip()
            for r in cmo_rows
            if (r["raw_prerequisite_text"] or "").strip()
        }

        if course_number in repeated_codes or course_number in transfer_or_sub_codes:
            reasons_en.append(
                "Course involves repeat credit or transfer/substitution rules requiring academic advisor verification."
            )
            reasons_ar.append(
                "المساق يتضمن إعادة مساق أو معادلة/استبدال يتطلب التحقق من المرشد الأكاديمي."
            )

        # Fetch prerequisite rules for this course
        rule_rows = cur.execute(
            """
            SELECT * FROM prerequisite_rules
            WHERE course_number = ? AND (program_id = ? OR program_id = '' OR ? = '')
            """,
            (course_number, program_id, program_id),
        ).fetchall()
        if not rule_rows:
            rule_rows = cur.execute(
                "SELECT * FROM prerequisite_rules WHERE course_number = ?",
                (course_number,),
            ).fetchall()

        # Case A: No prerequisite rules recorded
        if not rule_rows:
            if raw_prereq_catalog and raw_prereq_catalog.lower() not in {
                "none",
                "no prerequisite",
                "لا يوجد",
                "-",
            }:
                reasons_en.append(
                    f"Catalog mentions prerequisite text ('{raw_prereq_catalog}') without a parsed rule entry."
                )
                reasons_ar.append(
                    f"يوجد نص متطلب سابق في الدليل ('{raw_prereq_catalog}') بدون قاعدة محللة مقابلة."
                )
                return CourseEvaluationResult(
                    course_number=course_number,
                    title_ar=title_ar,
                    title_en=title_en,
                    credit_hours=credits,
                    readiness_state="needs_verification",
                    requirement_label=req_label,
                    is_mandatory_proven=is_mandatory_proven,
                    reasons_en=reasons_en,
                    reasons_ar=reasons_ar,
                    raw_prerequisite_text=raw_prereq_catalog,
                    parse_status="unindexed_raw_text",
                    has_conflict=has_conflict,
                    source_url=source_url,
                    last_verified_at=last_verified_at,
                )

            if has_conflict or course_number in repeated_codes or course_number in transfer_or_sub_codes:
                if has_conflict:
                    reasons_en.append("Course has a recorded website conflict in sources.")
                    reasons_ar.append("يوجد تعارض مسجل لهذا المساق بين صفحات الموقع الرسمي.")
                return CourseEvaluationResult(
                    course_number=course_number,
                    title_ar=title_ar,
                    title_en=title_en,
                    credit_hours=credits,
                    readiness_state="needs_verification",
                    requirement_label=req_label,
                    is_mandatory_proven=is_mandatory_proven,
                    reasons_en=reasons_en,
                    reasons_ar=reasons_ar,
                    raw_prerequisite_text=raw_prereq_catalog,
                    parse_status="none",
                    has_conflict=has_conflict,
                    source_url=source_url,
                    last_verified_at=last_verified_at,
                )

            reasons_en.append("No prerequisite courses required in official catalog.")
            reasons_ar.append("لا توجد متطلبات سابقة مسجلة لهذا المساق في الدليل الرسمي.")
            return CourseEvaluationResult(
                course_number=course_number,
                title_ar=title_ar,
                title_en=title_en,
                credit_hours=credits,
                readiness_state="requirements_met",
                requirement_label=req_label,
                is_mandatory_proven=is_mandatory_proven,
                reasons_en=reasons_en,
                reasons_ar=reasons_ar,
                raw_prerequisite_text=raw_prereq_catalog,
                parse_status="none",
                has_conflict=has_conflict,
                source_url=source_url,
                last_verified_at=last_verified_at,
            )

        # Case B: Evaluate all rule rows for this course
        missing_prereqs: List[str] = []
        coreq_candidates: List[str] = []
        needs_verif = False
        parse_statuses: List[str] = []
        combined_raw_texts: List[str] = []

        if len(distinct_prereq_texts) > 1 or has_conflict:
            needs_verif = True
            reasons_en.append(
                "Conflicting prerequisite or catalog metadata across program rows/website sources."
            )
            reasons_ar.append(
                "تعارض في بيانات المتطلبات السابقة أو الساعات المعتمدة بين سجلات البرنامج أو مصادر الموقع."
            )

        if course_number in repeated_codes or course_number in transfer_or_sub_codes:
            needs_verif = True

        for r in rule_rows:
            p_status = (r["parse_status"] or "raw_only").lower()
            parse_statuses.append(p_status)
            r_text = (r["raw_prerequisite_text"] or "").strip()
            if r_text and r_text not in combined_raw_texts:
                combined_raw_texts.append(r_text)

            rel_type = (r["relation_type"] or "prerequisite").lower()
            has_special = bool(r["has_special_condition"])
            expr_str = r["parsed_expression_json"]

            if p_status in {"raw_only", "ambiguous"} or has_special or not expr_str:
                needs_verif = True
                reasons_en.append(
                    f"Rule '{r['rule_id']}' has status '{p_status}' or non-course condition ('{r_text}') requiring manual verification."
                )
                reasons_ar.append(
                    f"القاعدة '{r['rule_id']}' بحالة '{p_status}' أو تتضمن شرطاً خاصاً ('{r_text}') يتطلب التحقق اليدوي."
                )
                continue

            try:
                ast_node = json.loads(expr_str)
            except ValueError:
                needs_verif = True
                reasons_en.append(f"Rule '{r['rule_id']}' expression JSON could not be parsed.")
                reasons_ar.append(f"تعذر تحليل صيغة القاعدة '{r['rule_id']}'.")
                continue

            # Check if any referenced prerequisite course was completed via unverified transfer/substitution
            target_codes = json.loads(r["target_course_numbers_json"] or "[]")
            if any(tc in transfer_or_sub_codes for tc in target_codes):
                needs_verif = True
                reasons_en.append(
                    "One or more prerequisite courses rely on unverified transfer or substitution credit."
                )
                reasons_ar.append(
                    "أحد المتطلبات السابقة يعتمد على مساق معادل أو بديل غير متحقق منه رسمياً."
                )

            if rel_type == "corequisite":
                # Corequisite can be satisfied by completed OR in_progress OR desired concurrent registration
                ok_done, _ = _eval_boolean_ast(ast_node, completed_codes)
                if ok_done is None:
                    needs_verif = True
                    continue
                if ok_done:
                    reasons_en.append(f"Corequisite rule ({r_text or r['rule_id']}) already completed.")
                    reasons_ar.append(f"المتطلب المتزامن ({r_text or r['rule_id']}) منجز مسبقاً.")
                else:
                    ok_co, missing_co = _eval_boolean_ast(
                        ast_node, completed_codes | in_progress_codes | desired_codes
                    )
                    for tc in target_codes or missing_co:
                        if tc not in completed_codes and tc not in coreq_candidates:
                            coreq_candidates.append(tc)
                    if ok_co:
                        reasons_en.append(
                            f"Corequisite condition: must be taken concurrently with or while completing {', '.join(coreq_candidates)}."
                        )
                        reasons_ar.append(
                            f"شرط متطلب متزامن: يتطلب التسجيل المتزامن أو استكمال {', '.join(coreq_candidates)}."
                        )
                    else:
                        reasons_en.append(
                            f"Corequisite condition: requires concurrent enrollment in {', '.join(coreq_candidates)}."
                        )
                        reasons_ar.append(
                            f"شرط متطلب متزامن: يتطلب التسجيل المتزامن في {', '.join(coreq_candidates)}."
                        )
            else:
                # Standard prerequisite requires COMPLETED status (in_progress or failed is not enough)
                ok_pre, missing_pre = _eval_boolean_ast(ast_node, completed_codes)
                if ok_pre is None:
                    needs_verif = True
                    reasons_en.append(f"Rule '{r['rule_id']}' contains an ambiguous structure.")
                    reasons_ar.append(f"القاعدة '{r['rule_id']}' تحتوي على بنية غير حاسمة.")
                    continue
                if not ok_pre:
                    for m in missing_pre:
                        if m not in missing_prereqs:
                            missing_prereqs.append(m)
                        if m in in_progress_codes:
                            reasons_en.append(
                                f"Prerequisite {m} is currently in progress (not yet completed)."
                            )
                            reasons_ar.append(
                                f"المتطلب السابق {m} قيد الدراسة حالياً (لم يُستكمل بعد)."
                            )
                        elif m in failed_codes:
                            reasons_en.append(
                                f"Prerequisite {m} is recorded as not passed/failed."
                            )
                            reasons_ar.append(
                                f"المتطلب السابق {m} مسجل كغير مجتاز."
                            )
                        else:
                            reasons_en.append(f"Missing required prerequisite course {m}.")
                            reasons_ar.append(f"المتطلب السابق الإلزامي {m} غير منجز.")
                else:
                    reasons_en.append(
                        f"Prerequisite rule ({r_text or r['rule_id']}) satisfied by completed courses."
                    )
                    reasons_ar.append(
                        f"تم استيفاء المتطلب السابق ({r_text or r['rule_id']}) من خلال المساقات المنجزة."
                    )

        # Resolve deterministic priority among the 4 states:
        # 1. If missing a definite parsed prerequisite -> missing_prerequisite (unless rule itself is unverified)
        # 2. If any rule/conflict/transfer is ambiguous/raw_only -> needs_verification
        # 3. If corequisite condition applies -> corequisite_condition
        # 4. Otherwise -> requirements_met
        if needs_verif:
            state = "needs_verification"
        elif missing_prereqs:
            state = "missing_prerequisite"
        elif coreq_candidates:
            state = "corequisite_condition"
        else:
            state = "requirements_met"

        summary_parse_status = (
            "ambiguous"
            if "ambiguous" in parse_statuses
            else ("raw_only" if "raw_only" in parse_statuses else "parsed")
        )

        return CourseEvaluationResult(
            course_number=course_number,
            title_ar=title_ar,
            title_en=title_en,
            credit_hours=credits,
            readiness_state=state,
            requirement_label=req_label,
            is_mandatory_proven=is_mandatory_proven,
            reasons_en=reasons_en,
            reasons_ar=reasons_ar,
            missing_courses=missing_prereqs,
            corequisite_courses=coreq_candidates,
            raw_prerequisite_text=" | ".join(combined_raw_texts) or raw_prereq_catalog,
            parse_status=summary_parse_status,
            has_conflict=has_conflict,
            source_url=source_url,
            last_verified_at=last_verified_at,
        )
