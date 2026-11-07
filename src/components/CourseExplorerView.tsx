import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Filter,
  Info,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  ILLUSTRATIVE_CONFLICTS,
  ILLUSTRATIVE_PREREQ_RULES,
} from '../data/verifiedReferenceData';
import { fetchCourses } from '../services/apiClient';
import {
  CatalogCourseRow,
  Language,
  ProgramEntry,
  StudentCourseStatus,
} from '../types/advisor';

interface CourseExplorerViewProps {
  lang: Language;
  backendConnected: boolean;
  programs: ProgramEntry[];
  onAddCourseToPlanner: (courseNumber: string, status: StudentCourseStatus) => void;
}

export const CourseExplorerView: React.FC<CourseExplorerViewProps> = ({
  lang,
  backendConnected,
  programs,
  onAddCourseToPlanner,
}) => {
  const isAr = lang === 'ar';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [conflictFilter, setConflictFilter] = useState<'all' | 'conflict_only'>('all');
  const [courses, setCourses] = useState<CatalogCourseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [fromLive, setFromLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedRow, setSelectedRow] = useState<CatalogCourseRow | null>(null);
  const [addedFeedback, setAddedFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchCourses({
      q: searchQuery,
      program_id: selectedProgram,
      has_conflict: conflictFilter === 'conflict_only' ? true : undefined,
      page: 1,
      page_size: 50,
    })
      .then((res) => {
        if (!active) return;
        setCourses(res.courses);
        setTotal(res.total);
        setFromLive(res.fromLiveBackend);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [searchQuery, selectedProgram, conflictFilter, backendConnected]);

  const handleQuickAdd = (courseNumber: string, status: StudentCourseStatus) => {
    onAddCourseToPlanner(courseNumber, status);
    setAddedFeedback(`${courseNumber} (${status})`);
    window.setTimeout(() => setAddedFeedback(null), 2200);
  };

  const relatedRules = selectedRow
    ? ILLUSTRATIVE_PREREQ_RULES.filter((r) => r.course_number === selectedRow.course_number)
    : [];
  const relatedConflicts = selectedRow
    ? ILLUSTRATIVE_CONFLICTS.filter((c) => c.course_number === selectedRow.course_number)
    : [];

  return (
    <div className="space-y-6">
      {/* Header & Search Bar */}
      <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-stone-900">
              {isAr
                ? 'مستكشف المساقات الرسمي (courses_master_official_only.csv)'
                : 'Official Course Catalog Explorer (courses_master_official_only.csv)'}
            </h1>
            <p className="text-xs text-stone-600">
              {isAr
                ? 'يحافظ على أرقام المساقات النصية من 7 خانات (مع الأصفار البادئة)، ويعرض السجلات الخاصة بكل برنامج دون دمج عشوائي للتعارضات، ويحجب العناوين العربية الوهمية (Placeholders).'
                : 'Preserves 7-digit string course codes with leading zeros, keeps program-specific conflicting rows distinct, and suppresses synthetic placeholder Arabic titles.'}
            </p>
          </div>

          {addedFeedback && (
            <div className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0">
              {isAr
                ? `تمت الإضافة للمخطط: ${addedFeedback}`
                : `Added to Planner: ${addedFeedback}`}
            </div>
          )}
        </div>

        {!fromLive && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">
              {isAr
                ? 'الخادم المحلي غير متصل (Local backend not connected) — السجلات المعروضة أدناه هي شريحة عرض توضيحية للواجهة (Illustrative UI demo) بدون أي جداول تجريبية'
                : 'Local backend not connected — Displaying illustrative UI demo slice (1,617 full rows load once SQLite is ingested locally)'}
            </span>
            <span className="font-mono text-[11px]">
              courses_master_official_only.csv (sample)
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-stone-400 absolute top-2.5 start-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isAr
                  ? 'ابحث برقم المساق من 7 خانات (مثل 0302101) أو الاسم العربي/الإنجليزي...'
                  : 'Search by 7-digit course code (e.g. 0302101) or Arabic/English title...'
              }
              className="w-full ps-9 pe-3 py-2 text-xs bg-white border border-stone-300 rounded-lg text-stone-900 focus:outline-none focus:border-[#0F5257]"
            />
          </div>

          <div>
            <select
              value={selectedProgram}
              onChange={(e) => setSelectedProgram(e.target.value)}
              aria-label={isAr ? 'تصفية حسب البرنامج' : 'Filter by program'}
              className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-lg text-stone-900 focus:outline-none focus:border-[#0F5257]"
            >
              <option value="">
                {isAr ? 'جميع البرامج (25 مدخلاً)' : 'All Programs (25 Entries)'}
              </option>
              {programs.map((p) => (
                <option key={p.program_id} value={p.program_id}>
                  {p.program_id} — {isAr ? p.name_ar : p.name_en}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg">
            <button
              type="button"
              onClick={() => setConflictFilter('all')}
              className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                conflictFilter === 'all'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {isAr ? `الكل (${total})` : `All (${total})`}
            </button>
            <button
              type="button"
              onClick={() => setConflictFilter('conflict_only')}
              className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                conflictFilter === 'conflict_only'
                  ? 'bg-white text-[#8C2D19] shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {isAr ? 'تعارضات الموقع فقط' : 'Conflicts Only'}
            </button>
          </div>
        </div>
      </section>

      {/* Catalog Table & Detail Drawer Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className={selectedRow ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-xs text-stone-500">
                {isAr ? 'جاري تحميل سجلات المساقات...' : 'Loading catalog records...'}
              </div>
            ) : courses.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-sm font-medium text-stone-800">
                  {isAr ? 'لم يتم العثور على سجلات مطابقة.' : 'No matching catalog rows found.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedProgram('');
                    setConflictFilter('all');
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-[#0F5257] hover:underline"
                >
                  {isAr ? 'إعادة ضبط الفلاتر' : 'Reset Filters'}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start border-collapse text-xs">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 text-stone-600">
                      <th className="py-2.5 px-3 font-semibold text-start">
                        {isAr ? 'رقم المساق (7 خانات)' : '7-Digit Code'}
                      </th>
                      <th className="py-2.5 px-3 font-semibold text-start">
                        {isAr ? 'عنوان المساق (الأصلي)' : 'Official Course Title'}
                      </th>
                      <th className="py-2.5 px-3 font-semibold text-start">
                        {isAr ? 'البرنامج' : 'Program'}
                      </th>
                      <th className="py-2.5 px-3 font-semibold text-end font-mono">
                        {isAr ? 'الساعات' : 'Credits'}
                      </th>
                      <th className="py-2.5 px-3 font-semibold text-start">
                        {isAr ? 'المتطلب السابق (النص الخام)' : 'Raw Prerequisite'}
                      </th>
                      <th className="py-2.5 px-3 font-semibold text-start">
                        {isAr ? 'حالة التوثيق' : 'Provenance State'}
                      </th>
                      <th className="py-2.5 px-3 font-semibold text-end">
                        {isAr ? 'إجراءات' : 'Actions'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {courses.map((row) => (
                      <tr
                        key={row.row_id}
                        onClick={() => setSelectedRow(row)}
                        className={`cursor-pointer transition-colors ${
                          selectedRow?.row_id === row.row_id
                            ? 'bg-[#0F5257]/5'
                            : 'hover:bg-stone-50/80'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono font-semibold text-[#0F5257] whitespace-nowrap">
                          {row.course_number}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-stone-900">
                            {row.title_ar ? row.title_ar : row.title_en}
                          </div>
                          <div className="text-[11px] text-stone-500">
                            {row.title_ar ? (
                              row.title_en
                            ) : row.is_arabic_placeholder ? (
                              <span className="text-amber-800">
                                {isAr
                                  ? 'العنوان العربي الرسمي غير متوفر (تم حجب قيمة placeholder)'
                                  : 'Official Arabic title missing (placeholder suppressed)'}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-stone-700 whitespace-nowrap">
                          {row.program_id}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums font-semibold text-stone-900">
                          {row.credit_hours ?? '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-stone-700">
                          {row.raw_prerequisite_text || 'None'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-[11px]">
                            {row.has_conflict ? (
                              <span className="text-[#8C2D19] font-semibold flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {isAr ? 'تعارض مسجل' : 'Conflict Recorded'}
                              </span>
                            ) : row.has_gap ? (
                              <span className="text-amber-800 font-medium">
                                {isAr ? 'فجوة بيانات' : 'Data Gap'}
                              </span>
                            ) : (
                              <span className="text-stone-600">
                                {isAr ? 'موثق' : 'Verified Row'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          className="py-2.5 px-3 text-end whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleQuickAdd(row.course_number, 'completed')}
                              className="px-2 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50 border border-stone-200 rounded transition-colors whitespace-nowrap shrink-0"
                              title={isAr ? 'أضف كمساق منجز' : 'Mark Completed in Planner'}
                            >
                              {isAr ? '+ منجز' : '+ Done'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickAdd(row.course_number, 'desired')}
                              className="px-2 py-1 text-[11px] font-medium text-[#0F5257] hover:bg-stone-100 border border-stone-200 rounded transition-colors whitespace-nowrap shrink-0"
                              title={isAr ? 'أضف كمساق مرغوب للفحص' : 'Add Desired to Planner'}
                            >
                              {isAr ? '+ فحص' : '+ Check'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Course Provenance & Prerequisite Rule Drawer */}
        {selectedRow && (
          <aside className="bg-white border border-stone-200 rounded-xl p-5 space-y-4 lg:sticky lg:top-6">
            <div className="flex items-start justify-between gap-2 border-b border-stone-200 pb-3">
              <div>
                <div className="text-xs font-mono text-[#0F5257] font-semibold">
                  {selectedRow.course_number} · {selectedRow.row_id}
                </div>
                <h2 className="text-base font-bold text-stone-900 mt-0.5">
                  {selectedRow.title_ar || selectedRow.title_en}
                </h2>
                {selectedRow.title_ar && (
                  <div className="text-xs text-stone-600">{selectedRow.title_en}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                aria-label={isAr ? 'إغلاق التفاصيل' : 'Close details'}
                className="p-1 text-stone-400 hover:text-stone-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedRow.is_arabic_placeholder && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isAr
                      ? 'تنبيه حجب الترجمة الوهمية (Placeholder Title Guard)'
                      : 'Placeholder Arabic Title Suppressed'}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  {isAr
                    ? 'يحتوي ملف courses.csv الموحد على نص بديل (Placeholder) لهذا المساق بسبب غياب الاسم العربي في المصدر، لذا لا يتم عرضه كترجمة رسمية.'
                    : 'Normalized courses.csv contains a placeholder string for this missing Arabic title; it is suppressed so guessed values are never shown as official university facts.'}
                </p>
              </div>
            )}

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">{isAr ? 'البرنامج:' : 'Program ID:'}</span>
                <span className="font-mono font-medium text-stone-900">
                  {selectedRow.program_id}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">
                  {isAr ? 'الساعات المعتمدة:' : 'Credit Hours:'}
                </span>
                <span className="font-mono font-semibold text-stone-900">
                  {selectedRow.credit_hours ?? 'Unverified'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">
                  {isAr ? 'تصنيف جدول المتطلبات:' : 'Plan Requirement Label:'}
                </span>
                <span className="font-mono text-stone-800">
                  {selectedRow.requirement_label} (not mandatory proof)
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">
                  {isAr ? 'تاريخ فحص المصدر:' : 'Last Verified At (Not Policy Date):'}
                </span>
                <span className="font-mono text-stone-800">
                  {selectedRow.last_verified_at || 'N/A'}
                </span>
              </div>
            </div>

            {selectedRow.description_ar || selectedRow.description_en ? (
              <div className="space-y-1 text-xs">
                <div className="font-semibold text-stone-800">
                  {isAr ? 'وصف المساق:' : 'Catalog Description:'}
                </div>
                <p className="text-stone-600 leading-relaxed">
                  {isAr
                    ? selectedRow.description_ar || selectedRow.description_en
                    : selectedRow.description_en || selectedRow.description_ar}
                </p>
              </div>
            ) : null}

            {/* Prerequisite Rules */}
            <div className="space-y-2 pt-2 border-t border-stone-200">
              <div className="text-xs font-semibold text-stone-800">
                {isAr
                  ? 'قواعد المتطلبات السابقة والمتزامنة (prerequisite_rules.csv):'
                  : 'Prerequisite & Corequisite Rules (prerequisite_rules.csv):'}
              </div>
              {relatedRules.length === 0 ? (
                <div className="text-xs text-stone-500 font-mono">
                  Raw catalog text: {selectedRow.raw_prerequisite_text || 'None'}
                </div>
              ) : (
                <div className="space-y-2">
                  {relatedRules.map((r) => (
                    <div
                      key={r.rule_id}
                      className="p-2.5 rounded border border-stone-200 bg-stone-50 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="font-semibold text-stone-900">{r.rule_id}</span>
                        <span
                          className={
                            r.parse_status === 'parsed'
                              ? 'text-emerald-700'
                              : 'text-[#8C2D19] font-semibold'
                          }
                        >
                          {r.relation_type} · {r.parse_status}
                        </span>
                      </div>
                      <div className="font-mono text-stone-700">{r.raw_prerequisite_text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Conflicts */}
            {relatedConflicts.length > 0 && (
              <div className="p-3 rounded-lg bg-red-50/70 border border-red-200 space-y-1.5 text-xs">
                <div className="font-semibold text-[#8C2D19] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isAr
                      ? 'تعارض مسجل في website_conflicts.csv'
                      : 'Recorded Conflict in website_conflicts.csv'}
                  </span>
                </div>
                {relatedConflicts.map((c) => (
                  <div key={c.conflict_id} className="space-y-1 text-stone-700">
                    <div>
                      Field: <code className="font-mono">{c.field_name}</code>
                    </div>
                    <div>
                      Source A: <code className="font-mono">{c.value_source_a}</code>
                    </div>
                    <div>
                      Source B: <code className="font-mono">{c.value_source_b}</code>
                    </div>
                    <p className="text-[11px] text-stone-600">{c.description}</p>
                  </div>
                ))}
              </div>
            )}

            {selectedRow.source_url && (
              <div className="pt-2 border-t border-stone-200 flex items-center justify-between">
                <a
                  href={selectedRow.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-[#0F5257] hover:underline flex items-center gap-1"
                >
                  <span>{isAr ? 'فتح رابط المصدر الرسمي' : 'Open Official Source URL'}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
};
