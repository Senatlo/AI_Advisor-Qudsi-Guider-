import React, { useEffect, useState } from 'react';
import { Language } from '../types/advisor';
import { fetchSourceRecords, KnowledgeStatus, SourceRecord } from '../services/liveData';

export function LiveSourcesView({ lang, knowledge, backendConnected }: { lang: Language; knowledge: KnowledgeStatus | null; backendConnected: boolean }) {
  const ar = lang === 'ar';
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    fetchSourceRecords().then(data => { if (active) setSources(data); }).catch(() => { if (active) { setSources([]); setError(true); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [backendConnected]);
  const counts = knowledge?.observed_counts;
  return <div className="space-y-6">
    <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
      <h1 className="text-xl font-bold">{ar ? 'المصادر وحالة البيانات' : 'Sources and data status'}</h1>
      <p className="text-sm text-stone-600">{ar ? 'القيم التالية من قاعدة البيانات الحالية. تاريخ فحص المصدر لا يعني تاريخ سريان لائحة.' : 'These values come from the current database. A source verification date is not a policy effective date.'}</p>
      <dl className="grid sm:grid-cols-2 gap-4 text-sm">
        {[[ar ? 'السجلات المفهرسة' : 'Indexed records', knowledge?.chroma_status.vector_count], [ar ? 'وثائق اللوائح' : 'Policy passages', counts?.policy_chunks], [ar ? 'تعارضات مسجلة' : 'Recorded conflicts', counts?.website_conflicts], [ar ? 'فجوات بيانات مسجلة' : 'Recorded data gaps', counts?.data_gaps]].map(([label, count]) => <div key={label} className="border-b border-stone-100 pb-2"><dt className="text-stone-500">{label}</dt><dd className="font-semibold">{count ?? '—'}</dd></div>)}
      </dl>
      <p className="text-xs text-stone-500">{ar ? 'تعرض المحادثة نص المتطلب المنشور واسم المساق المرتبط. هذه المعلومات إرشادية ولا تثبت أهلية التسجيل.' : 'Chat explains published prerequisite text and referenced course names. This information is advisory and does not establish registration eligibility.'}</p>
    </section>
    <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
      <h2 className="font-semibold">{ar ? 'روابط المصادر في قاعدة البيانات' : 'Source links in the database'}</h2>
      {loading && <p role="status">{ar ? 'جارٍ تحميل المصادر…' : 'Loading sources…'}</p>}
      {error && <p role="alert" className="text-sm text-red-800">{ar ? 'تعذر تحميل المصادر من الخادم.' : 'Could not load sources from the backend.'}</p>}
      {!loading && !error && !sources.length && <p className="text-sm">{ar ? 'لا توجد روابط مصادر محملة.' : 'No source links are loaded.'}</p>}
      <ul className="divide-y divide-stone-100">{sources.map(source => <li key={source.source_id} className="py-3"><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-sm text-[#0F5257] underline break-all">{source.title || source.source_id}</a></li>)}</ul>
    </section>
  </div>;
}
