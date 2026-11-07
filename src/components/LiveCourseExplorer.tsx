import React, { useEffect, useState } from 'react';
import { fetchCourses } from '../services/apiClient';
import { CatalogCourseRow, Language, ProgramEntry } from '../types/advisor';

interface Props { lang: Language; backendConnected: boolean; programs: ProgramEntry[]; initialProgram?: string }

export function LiveCourseExplorer({ lang, backendConnected, programs, initialProgram = '' }: Props) {
  const ar = lang === 'ar';
  const [query, setQuery] = useState('');
  const [program, setProgram] = useState(initialProgram);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CatalogCourseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [selected, setSelected] = useState<CatalogCourseRow | null>(null);
  const pageSize = 25;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setSelected(null);
    fetchCourses({ q: query, program_id: program, page, page_size: pageSize }).then(result => {
      if (!active) return;
      setRows(result.courses);
      setTotal(result.total);
      setAvailable(result.fromLiveBackend);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, program, page, backendConnected]);
  const title = (row: CatalogCourseRow) => ar ? row.title_ar || row.title_en : row.title_en || row.title_ar;
  return <div className="space-y-6">
    <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
      <h1 className="text-xl font-bold">{ar ? 'دليل المساقات' : 'Course catalog'}</h1>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-xs space-y-1"><span>{ar ? 'اسم المساق أو رقمه' : 'Course name or code'}</span><input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} className="block w-full border border-stone-300 rounded-lg p-2 text-sm" /></label>
        <label className="text-xs space-y-1"><span>{ar ? 'البرنامج' : 'Program'}</span><select value={program} onChange={e => { setProgram(e.target.value); setPage(1); }} className="block w-full border border-stone-300 rounded-lg p-2 text-sm"><option value="">{ar ? 'كل البرامج' : 'All programs'}</option>{programs.map(p => <option key={p.program_id} value={p.program_id}>{ar ? p.name_ar || p.name_en : p.name_en || p.name_ar}</option>)}</select></label>
      </div>
      {loading ? <p role="status" className="text-sm">{ar ? 'جارٍ تحميل المساقات…' : 'Loading courses…'}</p> : !available ? <p role="alert" className="text-sm text-red-800">{ar ? 'تعذر تحميل المساقات من الخادم. أعد فحص الاتصال.' : 'Could not load courses from the backend. Check the connection.'}</p> : <>
        <p className="text-xs text-stone-500">{total} {ar ? 'سجل مطابق' : 'matching records'}</p>
        <div className="overflow-x-auto"><table className="w-full text-sm text-start"><thead><tr className="border-b border-stone-200 text-stone-500"><th className="p-3 text-start">{ar ? 'رقم المساق' : 'Code'}</th><th className="p-3 text-start">{ar ? 'اسم المساق' : 'Course'}</th><th className="p-3 text-start">{ar ? 'الساعات' : 'Credits'}</th><th className="p-3 text-start">{ar ? 'البرنامج' : 'Program'}</th></tr></thead><tbody>{rows.map(row => <tr key={row.row_id} className="border-b border-stone-100"><td className="p-3 font-mono">{row.course_number}</td><td className="p-3"><button onClick={() => setSelected(row)} className="text-[#0F5257] hover:underline text-start">{title(row)}</button></td><td className="p-3">{row.credit_hours ?? '—'}</td><td className="p-3 text-xs">{row.program_id}</td></tr>)}</tbody></table></div>
        {!rows.length && <p className="text-sm">{ar ? 'لا توجد مساقات مطابقة.' : 'No matching courses.'}</p>}
        <div className="flex items-center justify-between gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="border rounded-lg px-3 py-1.5 disabled:opacity-40">{ar ? 'السابق' : 'Previous'}</button>
          <span>{page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
          <button disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)} className="border rounded-lg px-3 py-1.5 disabled:opacity-40">{ar ? 'التالي' : 'Next'}</button>
        </div>
      </>}
    </section>
    {selected && <section aria-label={ar ? 'تفاصيل المساق' : 'Course details'} className="bg-white border border-stone-200 rounded-xl p-6 space-y-3">
      <div className="flex justify-between gap-3"><h2 className="font-semibold">{selected.course_number} — {title(selected)}</h2><button onClick={() => setSelected(null)} className="text-xs text-stone-500 hover:underline">{ar ? 'إغلاق التفاصيل' : 'Close details'}</button></div>
      <p className="text-sm">{ar ? 'الساعات المعتمدة: ' : 'Credits: '}{selected.credit_hours ?? '—'}</p>
      <p className="text-sm">{ar ? 'البرنامج: ' : 'Program: '}{selected.program_id}</p>
      <p className="text-sm">{ar ? 'نص المتطلب المنشور: ' : 'Published prerequisite text: '}<span dir="auto">{selected.raw_prerequisite_text || (ar ? 'غير مذكور في السجل' : 'Not stated in this record')}</span></p>
      <p className="text-xs text-stone-500">{ar ? 'تاريخ فحص المصدر: ' : 'Source checked: '}{selected.last_verified_at || '—'}</p>
      {selected.source_url && <a href={selected.source_url} target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-[#0F5257] underline">{ar ? 'فتح المصدر الجامعي' : 'Open university source'}</a>}
      <p className="text-xs text-stone-500">{ar ? 'نص المتطلب من الدليل، ولا يمثل فحصاً لأهلية التسجيل.' : 'The prerequisite text is from the catalog and does not establish registration eligibility.'}</p>
    </section>}
  </div>;
}
