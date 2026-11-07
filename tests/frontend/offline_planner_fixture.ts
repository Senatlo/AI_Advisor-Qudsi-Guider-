// Legacy deterministic planner fixture. Not imported by the application.
import { ILLUSTRATIVE_CONFLICTS, ILLUSTRATIVE_PREREQ_RULES, ILLUSTRATIVE_PREVIEW_COURSES, REPRESENTED_25_PROGRAMS } from './fixtures/catalog';
import { CourseEvaluationItem, PlannerEvaluationResponse, ReadinessState, StudentCourseEntry } from '../../src/types/advisor';
import { preserveSevenDigitCode } from '../../src/services/apiClient';

/**
 * Deterministic prerequisite/corequisite/credit evaluator mirroring `backend/planner/engine.py`.
 * Never uses an LLM for numeric or boolean prerequisite logic.
 */
export function evaluateDeterministicPlanOffline(
  programId: string,
  studentCourses: StudentCourseEntry[],
  targetCourses?: string[]
): PlannerEvaluationResponse {
  const prog =
    REPRESENTED_25_PROGRAMS.find((p) => p.program_id === programId) || REPRESENTED_25_PROGRAMS[0];

  const completed = new Set<string>();
  const inProgress = new Set<string>();
  const failed = new Set<string>();
  const desired = new Set<string>();
  const repeated = new Set<string>();
  const transferOrSub = new Set<string>();
  const duplicateCompletedInputs: string[] = [];

  for (const item of studentCourses) {
    const code = preserveSevenDigitCode(item.course_number);
    if (!code) continue;
    if (item.is_repeat) repeated.add(code);
    if (item.is_transfer_or_substitution) transferOrSub.add(code);

    if (item.status === 'completed') {
      if (completed.has(code) && !duplicateCompletedInputs.includes(code)) {
        duplicateCompletedInputs.push(code);
      }
      completed.add(code);
    } else if (item.status === 'in_progress') {
      inProgress.add(code);
    } else if (item.status === 'failed_not_passed') {
      failed.add(code);
    } else if (item.status === 'desired') {
      desired.add(code);
    }
  }

  let validatedCredits = 0;
  const countedCourses: PlannerEvaluationResponse['credits_summary']['counted_courses'] = [];
  const unverifiedCourses: PlannerEvaluationResponse['credits_summary']['unverified_or_excluded_courses'] =
    [];

  for (const code of Array.from(completed).sort()) {
    if (transferOrSub.has(code)) {
      unverifiedCourses.push({
        course_number: code,
        reason_en: 'Transfer or substitution credit requires official faculty committee approval.',
        reason_ar: 'معادلة المساق أو الاستبدال يتطلب قراراً رسمياً من لجنة الكلية.',
      });
      continue;
    }
    const matchingRows = ILLUSTRATIVE_PREVIEW_COURSES.filter((c) => c.course_number === code);
    if (matchingRows.length === 0) {
      unverifiedCourses.push({
        course_number: code,
        reason_en:
          'Course code is not verified in the currently loaded catalog slice (ingest full ZIP locally).',
        reason_ar: 'رقم المساق غير متحقق منه في شريحة البيانات الحالية (قم باستيراد الحزمة الكاملة محلياً).',
      });
      continue;
    }
    const distinctCredits = Array.from(
      new Set(matchingRows.map((r) => r.credit_hours).filter((v): v is number => v !== null))
    );
    const hasConflict = matchingRows.some((r) => r.has_conflict);
    if (distinctCredits.length !== 1 || hasConflict) {
      unverifiedCourses.push({
        course_number: code,
        reason_en:
          'Course has a recorded credit-hour conflict across official website sources (3 vs 4 credits).',
        reason_ar: 'يوجد تعارض مسجل في عدد الساعات المعتمدة لهذا المساق بين صفحات الموقع (3 مقابل 4 ساعات).',
      });
      continue;
    }
    validatedCredits += distinctCredits[0];
    countedCourses.push({
      course_number: code,
      title_ar: matchingRows[0].title_ar,
      title_en: matchingRows[0].title_en,
      credit_hours: distinctCredits[0],
    });
  }

  const evalCodes = Array.from(
    new Set([
      ...(targetCourses || []).map(preserveSevenDigitCode),
      ...Array.from(desired),
      ...ILLUSTRATIVE_PREVIEW_COURSES.map((c) => c.course_number).filter((c) => !completed.has(c)),
    ])
  ).filter(Boolean);

  const evaluations: CourseEvaluationItem[] = evalCodes.map((code) => {
    const rows = ILLUSTRATIVE_PREVIEW_COURSES.filter((c) => c.course_number === code);
    const rules = ILLUSTRATIVE_PREREQ_RULES.filter((r) => r.course_number === code);
    const hasConflict =
      rows.some((r) => r.has_conflict) ||
      ILLUSTRATIVE_CONFLICTS.some((c) => c.course_number === code);

    if (rows.length === 0) {
      return {
        course_number: code,
        title_ar: '',
        title_en: 'Unindexed Course (Ingest ZIP locally)',
        credit_hours: null,
        readiness_state: 'needs_verification',
        requirement_label: 'unverified',
        is_mandatory_proven: false,
        reasons_en: [`Course ${code} requires local SQLite dataset ingestion to verify.`],
        reasons_ar: [`المساق ${code} يتطلب استيراد قاعدة البيانات المحلية للتحقق من شروطه.`],
        missing_courses: [],
        corequisite_courses: [],
        raw_prerequisite_text: '',
        parse_status: 'unindexed',
        has_conflict: false,
        source_url: '',
        last_verified_at: '',
        official_approval_disclaimer_en:
          'Requirements met reflects catalog prerequisite logic only — NOT official registration approval.',
        official_approval_disclaimer_ar:
          'استيفاء المتطلبات يعكس فحص المتطلبات السابقة حسب الدليل فقط — ولا يُعد موافقة رسمية على التسجيل.',
      };
    }

    const primary = rows[0];
    const reasonsEn: string[] = [];
    const reasonsAr: string[] = [];
    const missingCourses: string[] = [];
    const coreqCourses: string[] = [];
    let needsVerif = false;

    if (hasConflict) {
      needsVerif = true;
      reasonsEn.push('Recorded website conflict across catalog rows (3 vs 4 credit hours).');
      reasonsAr.push('يوجد تعارض مسجل بين صفحات الموقع الرسمي (3 مقابل 4 ساعات معتمدة).');
    }

    if (repeated.has(code) || transferOrSub.has(code)) {
      needsVerif = true;
      reasonsEn.push('Repeat or transfer/substitution rule requires manual advisor review.');
      reasonsAr.push('إعادة المساق أو معادلته تتطلب مراجعة المرشد الأكاديمي.');
    }

    for (const rule of rules) {
      if (rule.parse_status !== 'parsed' || rule.has_special_condition || !rule.parsed_expression_json) {
        needsVerif = true;
        reasonsEn.push(
          `Rule (${rule.parse_status}): "${rule.raw_prerequisite_text}" requires manual verification.`
        );
        reasonsAr.push(
          `قاعدة بحالة (${rule.parse_status}): "${rule.raw_prerequisite_text}" تتطلب التحقق اليدوي.`
        );
        continue;
      }

      const parsed = JSON.parse(rule.parsed_expression_json) as {
        type: string;
        course_number?: string;
      };
      const reqCode = parsed.course_number || '';

      if (rule.relation_type === 'corequisite') {
        if (!completed.has(reqCode)) {
          coreqCourses.push(reqCode);
          reasonsEn.push(
            `Corequisite condition: requires concurrent enrollment or completion of ${reqCode}.`
          );
          reasonsAr.push(`شرط متطلب متزامن: يتطلب التسجيل المتزامن أو إنجاز المساق ${reqCode}.`);
        } else {
          reasonsEn.push(`Corequisite ${reqCode} is already completed.`);
          reasonsAr.push(`المتطلب المتزامن ${reqCode} منجز مسبقاً.`);
        }
      } else {
        if (!completed.has(reqCode)) {
          missingCourses.push(reqCode);
          if (inProgress.has(reqCode)) {
            reasonsEn.push(`Prerequisite ${reqCode} is currently in progress (not yet completed).`);
            reasonsAr.push(`المتطلب السابق ${reqCode} قيد الدراسة حالياً (لم يُنجز بعد).`);
          } else if (failed.has(reqCode)) {
            reasonsEn.push(`Prerequisite ${reqCode} is marked as failed/not passed.`);
            reasonsAr.push(`المتطلب السابق ${reqCode} مسجل كغير مجتاز.`);
          } else {
            reasonsEn.push(`Missing required prerequisite ${reqCode}.`);
            reasonsAr.push(`المتطلب السابق الإلزامي ${reqCode} غير منجز.`);
          }
        } else {
          reasonsEn.push(`Prerequisite ${reqCode} satisfied by completed courses.`);
          reasonsAr.push(`تم استيفاء المتطلب السابق ${reqCode} من خلال المساقات المنجزة.`);
        }
      }
    }

    if (rules.length === 0 && !hasConflict) {
      reasonsEn.push('No prerequisite course required in official catalog.');
      reasonsAr.push('لا يوجد متطلب سابق مسجل لهذا المساق في الدليل الرسمي.');
    }

    let state: ReadinessState = 'requirements_met';
    if (needsVerif) {
      state = 'needs_verification';
    } else if (missingCourses.length > 0) {
      state = 'missing_prerequisite';
    } else if (coreqCourses.length > 0) {
      state = 'corequisite_condition';
    }

    return {
      course_number: code,
      title_ar: primary.is_arabic_placeholder ? '' : primary.title_ar,
      title_en: primary.title_en,
      credit_hours: primary.credit_hours,
      readiness_state: state,
      requirement_label: primary.requirement_label,
      is_mandatory_proven: false,
      reasons_en: reasonsEn,
      reasons_ar: reasonsAr,
      missing_courses: missingCourses,
      corequisite_courses: coreqCourses,
      raw_prerequisite_text: primary.raw_prerequisite_text,
      parse_status: rules[0]?.parse_status || 'none',
      has_conflict: hasConflict,
      source_url: primary.source_url,
      last_verified_at: primary.last_verified_at,
      official_approval_disclaimer_en:
        'Requirements met reflects catalog prerequisite logic only — it is NOT official university approval to register.',
      official_approval_disclaimer_ar:
        'استيفاء المتطلبات يعكس فحص المتطلبات السابقة حسب الدليل فقط — ولا يُعد موافقة رسمية على التسجيل.',
    };
  });

  const suggestions = evaluations
    .filter((e) => e.readiness_state === 'requirements_met' || e.readiness_state === 'corequisite_condition')
    .map((e) => ({
      course_number: e.course_number,
      title_ar: e.title_ar,
      title_en: e.title_en,
      credit_hours: e.credit_hours,
      readiness_state: e.readiness_state,
      suggestion_disclaimer_en:
        'Suggested study candidate based on catalog prerequisites only — NOT a real semester offering, instructor, room, or seat guarantee.',
      suggestion_disclaimer_ar:
        'مقترح إرشادي بناءً على المتطلبات السابقة في الدليل فقط — وليس طرحاً فصلياً حقيقياً أو ضماناً للمقاعد أو القاعات أو المحاضرين.',
    }));

  return {
    program_id: prog.program_id,
    program_name_ar: prog.name_ar,
    program_name_en: prog.name_en,
    evidence_level: prog.evidence_level,
    is_departmental_listing_only: prog.is_departmental_listing_only,
    degree_audit_guaranteed: false,
    official_graduation_percentage: null,
    degree_audit_refusal_reason_en:
      "Official graduation percentage and guaranteed degree audit are disabled: plan_course_requirements.csv labels 1,617 rows as 'recommended' (not proof of mandatory status), and cohort elective/substitution rules require official registrar verification.",
    degree_audit_refusal_reason_ar:
      'تم إيقاف حساب نسبة التخرج الرسمية والتدقيق النهائي المضمون للخطة: ملف متطلبات الخطة يصنف 1,617 سجلاً كمساقات مقترحة (recommended) وليس كدليل قاطع على الإلزام، كما أن قواعد المساقات الاختيارية والمعادلات تتطلب تدقيق القبول والتسجيل.',
    credits_summary: {
      validated_completed_credits: validatedCredits,
      counted_courses: countedCourses,
      unverified_or_excluded_courses: unverifiedCourses,
      duplicate_completed_inputs_ignored: duplicateCompletedInputs,
      repeated_courses_flagged: Array.from(repeated),
      transfer_or_substitution_flagged: Array.from(transferOrSub),
    },
    course_evaluations: evaluations,
    next_semester_suggestions: suggestions,
    evaluated_via: 'offline_deterministic_engine',
  };
}
