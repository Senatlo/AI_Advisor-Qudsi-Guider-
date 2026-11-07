import React from 'react';
import { HealthResponse, Language, ProgramEntry } from '../types/advisor';
import { KnowledgeStatus } from '../services/liveData';

interface Props {
  lang: Language;
  health: HealthResponse | null;
  knowledge: KnowledgeStatus | null;
  programs: ProgramEntry[];
  onNavigate: (tab: 'chat' | 'courses' | 'evidence') => void;
  onBrowseProgram: (program: string) => void;
}

export function LiveOverview({ lang, health, knowledge, programs, onNavigate, onBrowseProgram }: Props) {
  const ar = lang === 'ar';
  const counts = knowledge?.observed_counts;
  const cards = [
    [ar ? 'سجلات المساقات' : 'Course records', counts?.courses_master_official],
    [ar ? 'المساقات الفريدة' : 'Distinct courses', counts?.distinct_course_numbers],
    [ar ? 'البرامج والأقسام' : 'Programs and departments', counts?.programs],
    [ar ? 'السجلات المفهرسة دلالياً' : 'Semantic index records', knowledge?.chroma_status.vector_count],
  ];
  return <div className="space-y-6">
    <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
      <h1 className="text-2xl font-bold">{ar ? 'المرشد الأكاديمي — جامعة القدس' : 'Al-Quds Academic Advisor'}</h1>
      <p className="text-sm text-stone-600">{ar ? 'ابحث عن المساقات واسأل عن أسمائها وساعاتها ومتطلباتها المنشورة، مع روابط المصادر.' : 'Explore courses and ask about their names, credits, and published prerequisites, with source links.'}</p>
      <div className="flex flex-wrap gap-3">
        <button onClick={() => onNavigate('chat')} className="px-4 py-2 rounded-lg bg-[#0F5257] text-white text-sm">{ar ? 'اسأل المرشد' : 'Ask the advisor'}</button>
        <button onClick={() => onNavigate('courses')} className="px-4 py-2 rounded-lg border border-stone-300 text-sm">{ar ? 'استعرض المساقات' : 'Browse courses'}</button>
        <button onClick={() => onNavigate('evidence')} className="px-4 py-2 rounded-lg border border-stone-300 text-sm">{ar ? 'المصادر وحالة البيانات' : 'Sources and data status'}</button>
      </div>
      <p className="text-xs text-stone-500">{ar ? 'المعلومات إرشادية وليست موافقة على التسجيل. لا تتوفر حالياً لوائح جامعية مفهرسة للإجابة عن الرسوم والأنظمة.' : 'Information is advisory, not registration approval. University bylaws are not currently indexed for fees or regulations.'}</p>
    </section>
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label={ar ? 'البيانات المحملة' : 'Loaded data'}>
      {cards.map(([label, value]) => <div key={label} className="bg-white border border-stone-200 rounded-xl p-4"><p className="text-xs text-stone-500">{label}</p><p className="text-2xl font-semibold mt-2">{value ?? '—'}</p></div>)}
    </section>
    <p className="text-xs text-stone-600">{ar ? 'نموذج المحادثة: ' : 'Chat model: '}<span dir="ltr">{health?.ollama.configured_chat_model || '—'}</span></p>
    <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
      <h2 className="font-semibold">{ar ? 'البرامج في قاعدة البيانات' : 'Programs in the database'}</h2>
      {!programs.length && <p className="text-sm text-stone-500">{ar ? 'لا تتوفر بيانات برامج من الخادم.' : 'No program data is available from the backend.'}</p>}
      <div className="divide-y divide-stone-100">{programs.map(program => <div key={program.program_id} className="py-3 flex items-center justify-between gap-3">
        <div><p className="text-sm">{ar ? program.name_ar || program.name_en : program.name_en || program.name_ar}</p><p className="text-xs text-stone-500">{program.course_row_count} {ar ? 'سجل مساق' : 'course records'}</p></div>
        <button onClick={() => onBrowseProgram(program.program_id)} className="text-xs text-[#0F5257] hover:underline">{ar ? 'عرض المساقات' : 'View courses'}</button>
      </div>)}</div>
    </section>
  </div>;
}
