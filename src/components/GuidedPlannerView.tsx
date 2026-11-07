import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  HelpCircle,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  evaluateStudyPlan,
  preserveSevenDigitCode,
} from '../services/apiClient';
import {
  Language,
  PlannerEvaluationResponse,
  ProgramEntry,
  ReadinessState,
  StudentCourseEntry,
  StudentCourseStatus,
} from '../types/advisor';

interface GuidedPlannerViewProps {
  lang: Language;
  backendConnected: boolean;
  programs: ProgramEntry[];
  selectedProgramId: string;
  onSelectProgramId: (programId: string) => void;
  studentCourses: StudentCourseEntry[];
  onUpdateStudentCourses: (courses: StudentCourseEntry[]) => void;
}

export const GuidedPlannerView: React.FC<GuidedPlannerViewProps> = ({
  lang,
  backendConnected,
  programs,
  selectedProgramId,
  onSelectProgramId,
  studentCourses,
  onUpdateStudentCourses,
}) => {
  const isAr = lang === 'ar';
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseStatus, setNewCourseStatus] = useState<StudentCourseStatus>('completed');
  const [newIsRepeat, setNewIsRepeat] = useState(false);
  const [newIsTransfer, setNewIsTransfer] = useState(false);
  const [evaluation, setEvaluation] = useState<PlannerEvaluationResponse | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  const currentProgram =
    programs.find((p) => p.program_id === selectedProgramId) || programs[0];

  useEffect(() => {
    let active = true;
    setEvaluating(true);
    evaluateStudyPlan(currentProgram.program_id, studentCourses)
      .then((res) => {
        if (active) setEvaluation(res);
      })
      .finally(() => {
        if (active) setEvaluating(false);
      });
    return () => {
      active = false;
    };
  }, [currentProgram.program_id, studentCourses, backendConnected]);

  const handleAddCourse = (e: React.FormEvent) => {
    e.preventDefault();
    const norm = preserveSevenDigitCode(newCourseCode);
    if (!norm) return;
    onUpdateStudentCourses([
      ...studentCourses,
      {
        course_number: norm,
        status: newCourseStatus,
        is_repeat: newIsRepeat,
        is_transfer_or_substitution: newIsTransfer,
      },
    ]);
    setNewCourseCode('');
    setNewIsRepeat(false);
    setNewIsTransfer(false);
  };

  const handleRemoveEntry = (idx: number) => {
    onUpdateStudentCourses(studentCourses.filter((_, i) => i !== idx));
  };

  const handleLoadSyntheticDemoProfile = () => {
    // Fictional synthetic student profile demonstrating all 4 states & duplicate/conflict guards
    onUpdateStudentCourses([
      {
        course_number: '0302101',
        status: 'completed',
        is_repeat: false,
        is_transfer_or_substitution: false,
      },
      {
        course_number: '0302102',
        status: 'in_progress',
        is_repeat: false,
        is_transfer_or_substitution: false,
      },
      {
        course_number: '0302204',
        status: 'desired',
        is_repeat: false,
        is_transfer_or_substitution: false,
      },
      {
        course_number: '0302205',
        status: 'desired',
        is_repeat: false,
        is_transfer_or_substitution: false,
      },
      {
        course_number: '0302310',
        status: 'completed',
        is_repeat: false,
        is_transfer_or_substitution: false,
      },
      {
        course_number: '0302350',
        status: 'desired',
        is_repeat: false,
        is_transfer_or_substitution: false,
      },
      {
        course_number: '0302499',
        status: 'desired',
        is_repeat: false,
        is_transfer_or_substitution: false,
      },
    ]);
  };

  const handleExportJson = () => {
    const payload = {
      project: 'Al-Quds AI Academic Advisor — Manual Student Progress Export',
      note: 'Student-entered manual records only. Contains zero portal credentials or session tokens.',
      exported_at: new Date().toISOString(),
      program_id: currentProgram.program_id,
      student_courses: studentCourses,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alquds_study_plan_${currentProgram.program_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderStateBadge = (state: ReadinessState) => {
    if (state === 'requirements_met') {
      return (
        <span className="inline-flex items-center gap-1.5 text-emerald-800 font-semibold">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>requirements_met ({isAr ? 'مستوفي المتطلب' : 'Met'})</span>
        </span>
      );
    }
    if (state === 'corequisite_condition') {
      return (
        <span className="inline-flex items-center gap-1.5 text-blue-800 font-semibold">
          <Clock className="w-4 h-4 shrink-0" />
          <span>corequisite_condition ({isAr ? 'شرط تزامن' : 'Corequisite'})</span>
        </span>
      );
    }
    if (state === 'missing_prerequisite') {
      return (
        <span className="inline-flex items-center gap-1.5 text-red-800 font-semibold">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>missing_prerequisite ({isAr ? 'متطلب سابق غير منجز' : 'Missing Prereq'})</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-800 font-semibold">
        <HelpCircle className="w-4 h-4 shrink-0" />
        <span>needs_verification ({isAr ? 'يتطلب تحققاً يدوياً' : 'Needs Verification'})</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Program Selection & Evidence Level Banner */}
      <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-stone-900">
              {isAr
                ? 'مخطط الدراسة الموجه والفحص الحتمي للمتطلبات (Deterministic Planner)'
                : 'Guided Study Planner & Deterministic Prerequisite Engine'}
            </h1>
            <p className="text-xs text-stone-600">
              {isAr
                ? 'يُقيّم جاهزية المساقات عبر آلة حالات منطقية حتمية دون الاعتماد على النموذج اللغوي (Qwen) في أي عمليات حسابية أو قرارات أهلية.'
                : 'Evaluates course readiness via a deterministic boolean state machine — never delegates credit math or prerequisite eligibility to Qwen.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleLoadSyntheticDemoProfile}
              className="px-3 py-1.5 text-xs font-medium text-stone-800 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {isAr
                ? 'تحميل ملف طالب افتراضي للتجربة (Synthetic Profile)'
                : 'Load Synthetic Test Student Profile'}
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="px-3 py-1.5 text-xs font-medium text-[#0F5257] bg-white hover:bg-stone-50 border border-stone-300 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isAr ? 'تصدير JSON' : 'Export JSON'}</span>
            </button>
            <button
              type="button"
              onClick={() => onUpdateStudentCourses([])}
              className="px-3 py-1.5 text-xs font-medium text-[#8C2D19] bg-white hover:bg-red-50 border border-stone-300 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isAr ? 'حذف السجل المحلي' : 'Purge Local Storage'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-stone-200">
          <div>
            <label
              htmlFor="planner-program-select"
              className="block text-xs font-medium text-stone-700 mb-1"
            >
              {isAr
                ? 'اختر البرنامج / القسم الأكاديمي (25 مدخلاً):'
                : 'Select Program / Department Entry (25 Entries):'}
            </label>
            <select
              id="planner-program-select"
              value={currentProgram.program_id}
              onChange={(e) => onSelectProgramId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-lg text-stone-900 focus:outline-none focus:border-[#0F5257]"
            >
              {programs.map((p) => (
                <option key={p.program_id} value={p.program_id}>
                  {p.program_id} — {isAr ? p.name_ar : p.name_en} ({p.evidence_level})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 p-3.5 rounded-lg bg-stone-50 border border-stone-200 space-y-1 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-stone-900">
                {isAr ? 'مستوى توثيق البرنامج:' : 'Program Evidence Level:'}{' '}
                <code className="font-mono text-[#0F5257]">{currentProgram.evidence_level}</code>
              </span>
              <span className="text-stone-500">
                {isAr
                  ? 'بيانات التقدم مدخلة يدوياً من الطالب (Manual Student-Entered Records)'
                  : 'Progress is student-entered manually (stored in browser localStorage)'}
              </span>
            </div>
            <p className="text-stone-600 leading-relaxed">
              {isAr ? currentProgram.caveat_note_ar : currentProgram.caveat_note_en}
            </p>
          </div>
        </div>
      </section>

      {/* Manual Course Entry Form & Current Student Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-stone-900">
            {isAr
              ? 'إضافة مساق يدوياً لسجل الطالب'
              : 'Manually Record Student Course Status'}
          </h2>

          <form onSubmit={handleAddCourse} className="space-y-3 text-xs">
            <div>
              <label
                htmlFor="planner-course-code"
                className="block font-medium text-stone-700 mb-1"
              >
                {isAr ? 'رقم المساق (7 خانات مع الصفر البادئ):' : '7-Digit Course Number:'}
              </label>
              <input
                id="planner-course-code"
                type="text"
                value={newCourseCode}
                onChange={(e) => setNewCourseCode(e.target.value)}
                placeholder="0302101"
                className="w-full px-3 py-2 font-mono bg-white border border-stone-300 rounded-lg text-stone-900 focus:outline-none focus:border-[#0F5257]"
              />
            </div>

            <div>
              <label
                htmlFor="planner-course-status"
                className="block font-medium text-stone-700 mb-1"
              >
                {isAr ? 'حالة المساق:' : 'Course Status:'}
              </label>
              <select
                id="planner-course-status"
                value={newCourseStatus}
                onChange={(e) => setNewCourseStatus(e.target.value as StudentCourseStatus)}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-stone-900"
              >
                <option value="completed">
                  {isAr ? 'منجز بنجاح (completed)' : 'Completed (Passed)'}
                </option>
                <option value="in_progress">
                  {isAr ? 'قيد الدراسة حالياً (in_progress)' : 'In Progress (Current Term)'}
                </option>
                <option value="failed_not_passed">
                  {isAr ? 'غير مجتاز / راسب (failed_not_passed)' : 'Failed / Not Passed'}
                </option>
                <option value="desired">
                  {isAr ? 'مرغوب للفصل القادم (desired)' : 'Desired (Target to Check)'}
                </option>
              </select>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="flex items-center gap-2 text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newIsRepeat}
                  onChange={(e) => setNewIsRepeat(e.target.checked)}
                  className="rounded border-stone-300"
                />
                <span>
                  {isAr
                    ? 'مساق معاد (Repeat — يحوّل الحساب إلى needs_verification)'
                    : 'Repeated course (marks repeat credit as needs_verification)'}
                </span>
              </label>
              <label className="flex items-center gap-2 text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newIsTransfer}
                  onChange={(e) => setNewIsTransfer(e.target.checked)}
                  className="rounded border-stone-300"
                />
                <span>
                  {isAr
                    ? 'مساق معادل / بديل (Transfer / Substitution — يتطلب تحققاً رسمياً)'
                    : 'Transfer / substitution credit (requires committee verification)'}
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={!newCourseCode.trim()}
              className="w-full py-2 px-4 text-xs font-medium text-white bg-[#0F5257] hover:bg-[#0B3E42] disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة للسجل وإعادة الفحص' : 'Add Course & Re-Evaluate'}</span>
            </button>
          </form>

          {/* Student Course List */}
          <div className="pt-3 border-t border-stone-200 space-y-2">
            <div className="text-xs font-semibold text-stone-800">
              {isAr
                ? `المساقات المدخلة يدوياً (${studentCourses.length}):`
                : `Manually Recorded Courses (${studentCourses.length}):`}
            </div>
            {studentCourses.length === 0 ? (
              <p className="text-xs text-stone-500">
                {isAr
                  ? 'لم يتم إدخال مساقات بعد. أضف مساقاً أو حمّل الملف الافتراضي للتجربة.'
                  : 'No courses entered yet. Add a course above or load the synthetic test profile.'}
              </p>
            ) : (
              <div className="divide-y divide-stone-200 border border-stone-200 rounded-lg max-h-72 overflow-y-auto">
                {studentCourses.map((c, idx) => (
                  <div
                    key={`${c.course_number}_${idx}`}
                    className="p-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-mono font-semibold text-stone-900">
                        {c.course_number}
                      </span>
                      <span className="text-stone-400 mx-1.5">·</span>
                      <span className="text-stone-700 font-mono text-[11px]">{c.status}</span>
                      {(c.is_repeat || c.is_transfer_or_substitution) && (
                        <div className="text-[11px] text-amber-800">
                          {c.is_repeat ? 'repeat ' : ''}
                          {c.is_transfer_or_substitution ? 'transfer/sub' : ''}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveEntry(idx)}
                      className="text-stone-400 hover:text-[#8C2D19] p-1"
                      aria-label="Remove course"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Evaluation Results & Credit Calculation */}
        <section className="lg:col-span-2 space-y-6">
          {evaluation && (
            <>
              {/* Credit Summary & Degree Audit Refusal Guard */}
              <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-stone-900">
                    {isAr
                      ? 'ملخص الساعات المعتمدة المنجزة والتحقق الحتمي'
                      : 'Validated Completed Credits & Degree Audit Guard'}
                  </h2>
                  <span className="text-xs font-mono text-stone-500">
                    {evaluation.evaluated_via === 'local_fastapi_backend'
                      ? 'Evaluated via Python FastAPI /api/planner/evaluate'
                      : 'Evaluated via Deterministic Rule Engine (Local Backend Offline)'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg border border-stone-200 bg-stone-50/60">
                    <div className="text-xs text-stone-500">
                      {isAr
                        ? 'الساعات المنجزة الموثقة (بدون تكرار)'
                        : 'Validated Completed Credits (No Double Counting)'}
                    </div>
                    <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0F5257]">
                      {evaluation.credits_summary.validated_completed_credits}
                    </div>
                    <div className="mt-1 text-[11px] text-stone-500">
                      {isAr
                        ? `${evaluation.credits_summary.counted_courses.length} مساقات موثقة فقط`
                        : `${evaluation.credits_summary.counted_courses.length} verified courses counted`}
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border border-stone-200 bg-stone-50/60">
                    <div className="text-xs text-stone-500">
                      {isAr
                        ? 'سجلات مستبعدة من جمع الساعات (تعارض/معادلة)'
                        : 'Excluded from Credit Sum (Conflict/Transfer)'}
                    </div>
                    <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#8C2D19]">
                      {evaluation.credits_summary.unverified_or_excluded_courses.length}
                    </div>
                    <div className="mt-1 text-[11px] text-stone-500">
                      {isAr ? 'تتطلب تحققاً رسمياً' : 'Require advisor verification'}
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border border-stone-200 bg-stone-50/60">
                    <div className="text-xs text-stone-500">
                      {isAr ? 'نسبة التخرج الرسمية / تدقيق الخطة' : 'Official Graduation % / Audit'}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-amber-900">
                      {isAr
                        ? 'محجوب منهجياً (غير متاح بدون خطة كاملة موثقة)'
                        : 'Withheld (Requires Complete Cohort Plan)'}
                    </div>
                    <div className="mt-1 text-[11px] text-stone-500">
                      {isAr ? 'لا يتم تخمين نسب التخرج' : 'Never guessed or fabricated'}
                    </div>
                  </div>
                </div>

                {/* Unverified / Excluded Credit Explanations */}
                {evaluation.credits_summary.unverified_or_excluded_courses.length > 0 && (
                  <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 space-y-1 text-xs">
                    <div className="font-semibold text-amber-950">
                      {isAr
                        ? 'مساقات منجزة لم تُجمع ساعاتها تلقائياً بسبب تعارض المصادر أو المعادلة:'
                        : 'Completed courses excluded from automatic credit total due to source conflict or transfer:'}
                    </div>
                    {evaluation.credits_summary.unverified_or_excluded_courses.map((u) => (
                      <div key={u.course_number} className="text-stone-700">
                        <span className="font-mono font-semibold">{u.course_number}</span>:{' '}
                        {isAr ? u.reason_ar : u.reason_en}
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-3.5 rounded-lg bg-stone-50 border border-stone-200 text-xs text-stone-600 leading-relaxed">
                  <strong className="text-stone-800">
                    {isAr ? 'سبب حجب نسبة التخرج الرسمية:' : 'Why Official Graduation % is Withheld:'}
                  </strong>{' '}
                  {isAr
                    ? evaluation.degree_audit_refusal_reason_ar
                    : evaluation.degree_audit_refusal_reason_en}
                </div>
              </div>

              {/* Per-Course Deterministic Readiness Table */}
              <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-stone-900">
                    {isAr
                      ? 'نتائج فحص جاهزية المساقات (الحالات الأربع الحتمية)'
                      : 'Course Readiness Matrix (4 Deterministic States)'}
                  </h2>
                  <p className="text-xs text-stone-600">
                    {isAr
                      ? 'حتى في حالة requirements_met فإن النتيجة تعكس فحص المتطلبات السابقة حسب الدليل فقط ولا تعني موافقة رسمية على التسجيل.'
                      : 'Even when requirements_met is shown, it reflects catalog prerequisite logic only and never constitutes official approval to register.'}
                  </p>
                </div>

                <div className="overflow-x-auto border border-stone-200 rounded-lg">
                  <table className="w-full text-start border-collapse text-xs">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-200 text-stone-600">
                        <th className="py-2.5 px-3 font-semibold text-start">
                          {isAr ? 'المساق' : 'Course'}
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-end font-mono">
                          {isAr ? 'الساعات' : 'Cr'}
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-start">
                          {isAr ? 'حالة الجاهزية الحتمية' : 'Readiness State'}
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-start">
                          {isAr ? 'التفسير المنطقي والقيود' : 'Rule Trace & Caveats'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                      {evaluation.course_evaluations.map((ev) => (
                        <tr key={ev.course_number} className="hover:bg-stone-50/70">
                          <td className="py-3 px-3 align-top">
                            <div className="font-mono font-semibold text-stone-900">
                              {ev.course_number}
                            </div>
                            <div className="font-medium text-stone-800">
                              {ev.title_ar || ev.title_en}
                            </div>
                            <div className="text-[11px] text-stone-500 font-mono">
                              Label: {ev.requirement_label} · Rule: {ev.parse_status}
                            </div>
                          </td>
                          <td className="py-3 px-3 align-top text-end font-mono tabular-nums text-stone-900">
                            {ev.credit_hours ?? '—'}
                          </td>
                          <td className="py-3 px-3 align-top whitespace-nowrap">
                            {renderStateBadge(ev.readiness_state)}
                          </td>
                          <td className="py-3 px-3 align-top space-y-1 text-stone-700">
                            {(isAr ? ev.reasons_ar : ev.reasons_en).map((reason, idx) => (
                              <div key={idx}>• {reason}</div>
                            ))}
                            <div className="text-[11px] text-stone-500 pt-1">
                              {isAr
                                ? ev.official_approval_disclaimer_ar
                                : ev.official_approval_disclaimer_en}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Next-Semester Suggestions (Strictly Labelled as Suggestions, Not Offerings) */}
              <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-stone-900">
                    {isAr
                      ? 'مقترحات إرشادية للفصل القادم (Suggestions Only — ليست طرحاً فصلياً حقيقياً)'
                      : 'Advisory Next-Semester Suggestions (NOT Real Course Offerings)'}
                  </h2>
                </div>
                <p className="text-xs text-stone-600">
                  {isAr
                    ? 'تُدرج هذه القائمة المساقات التي استوفت متطلباتها السابقة أو المتزامنة كاقتراحات للمناقشة مع المرشد الأكاديمي فقط — لا تتضمن أي أوقات محاضرات أو قاعات أو أسماء محاضرين أو ضمان لتوفر المقاعد.'
                    : 'Lists courses whose catalog prerequisites or corequisites are satisfied as planning suggestions only — contains zero fabricated lecturers, times, classrooms, or seat guarantees.'}
                </p>

                {evaluation.next_semester_suggestions.length === 0 ? (
                  <p className="text-xs text-stone-500">
                    {isAr
                      ? 'لا توجد مساقات مستوفية الشروط حالياً في قائمة الفحص.'
                      : 'No courses currently satisfy prerequisite/corequisite conditions.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {evaluation.next_semester_suggestions.map((sug) => (
                      <div
                        key={sug.course_number}
                        className="p-3.5 rounded-lg border border-stone-200 bg-stone-50/50 space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-[#0F5257]">
                            {sug.course_number}
                          </span>
                          <span className="font-mono text-stone-600">
                            {sug.credit_hours ?? '—'} Cr · {sug.readiness_state}
                          </span>
                        </div>
                        <div className="font-medium text-stone-900">
                          {sug.title_ar || sug.title_en}
                        </div>
                        <p className="text-[11px] text-stone-500">
                          {isAr ? sug.suggestion_disclaimer_ar : sug.suggestion_disclaimer_en}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
