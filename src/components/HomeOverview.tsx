import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Database,
  FileWarning,
  MessageSquare,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import {
  EXCLUDED_SYNTHETIC_ASSETS,
  EXPECTED_DATASET_DIAGNOSTICS,
  VERIFIED_CSV_INVENTORY,
} from '../data/verifiedReferenceData';
import {
  EvidenceLevel,
  HealthResponse,
  Language,
  NavigationTab,
  ProgramEntry,
} from '../types/advisor';

interface HomeOverviewProps {
  lang: Language;
  backendConnected: boolean;
  health: HealthResponse | null;
  programs: ProgramEntry[];
  onNavigate: (tab: NavigationTab) => void;
  onSelectQuestionForChat: (question: string, programId?: string) => void;
  onSelectProgramForPlanner: (programId: string) => void;
}

export const HomeOverview: React.FC<HomeOverviewProps> = ({
  lang,
  backendConnected,
  health,
  programs,
  onNavigate,
  onSelectQuestionForChat,
  onSelectProgramForPlanner,
}) => {
  const isAr = lang === 'ar';
  const [tierFilter, setTierFilter] = useState<'all' | EvidenceLevel>('all');

  const filteredPrograms = programs.filter((p) =>
    tierFilter === 'all' ? true : p.evidence_level === tierFilter
  );

  const starterQuestions = [
    {
      q_ar: 'ما هو المتطلب السابق وعدد الساعات للمساق 0302102 تراكيب البيانات؟',
      q_en: 'What is the prerequisite and credit count for course 0302102 Data Structures?',
      programId: 'COMP-BS',
      tag_ar: 'استعلام مساق موثق (7 خانات)',
      tag_en: 'Verified 7-Digit Catalog Lookup',
    },
    {
      q_ar: 'هل يوجد تعارض في عدد الساعات المعتمدة لمساق 0302310 شبكات الحاسوب؟',
      q_en: 'Is there a credit-hour conflict recorded for course 0302310 Computer Networks?',
      programId: 'COMP-BS',
      tag_ar: 'كشف تعارضات الموقع (53 تعارضاً)',
      tag_en: 'Website Conflict Transparency',
    },
    {
      q_ar: 'في أي قاعة ومع أي دكتور يُطرح مساق 0302101 يوم الإثنين؟',
      q_en: 'Which room and instructor teaches course 0302101 on Monday?',
      programId: 'COMP-BS',
      tag_ar: 'اختبار رفض الجداول التجريبية المستبعدة',
      tag_en: 'Excluded Synthetic Schedule Refusal Test',
    },
    {
      q_ar: 'ما هي شروط القبول في جامعة بيرزيت لتخصص علم الحاسوب؟',
      q_en: 'What are the admission rules at Birzeit University for Computer Science?',
      programId: '',
      tag_ar: 'اختبار رفض الجامعات خارج النطاق',
      tag_en: 'Out-of-Scope Institution Refusal Test',
    },
  ];

  const evidenceLabel = (level: EvidenceLevel) => {
    if (level === 'verified_planning') {
      return isAr ? 'تخطيط موثق' : 'Verified Planning';
    }
    if (level === 'partial_planning') {
      return isAr ? 'تخطيط جزئي (مع فجوات موثقة)' : 'Partial Planning (Documented Gaps)';
    }
    return isAr ? 'دليل مساقات فقط (Catalog-Only)' : 'Catalog-Only Listing';
  };

  return (
    <div className="space-y-8">
      {/* Institutional Scope & Disclaimers Hero */}
      <section className="bg-white border border-stone-200 rounded-xl p-6 sm:p-8">
        <div className="max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
            <span className="font-semibold text-[#0F5257]">
              {isAr ? 'مشروع طلابي مستقل' : 'Independent Student Project'}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {isAr
                ? 'النطاق المؤسسي: جامعة القدس حصرياً'
                : 'Institution Scope: Al-Quds University Only'}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {isAr
                ? 'استرجاع معزز محلي (RAG) بدون تعديل أوزان النموذج (No Fine-Tuning)'
                : 'Local RAG Only — Zero Model Fine-Tuning'}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight text-balance">
            {isAr
              ? 'المرشد الأكاديمي الذكي ومخطط الدراسة الموجه — جامعة القدس'
              : 'Al-Quds AI Academic Advisor & Deterministic Study Planner'}
          </h1>

          <p className="text-sm sm:text-base text-stone-700 leading-relaxed">
            {isAr
              ? 'منصة إرشاد أكاديمي مبنية على الأدلة الموثقة لـ 25 برنامجاً وقسماً أكاديمياً في جامعة القدس. تفصل المنصة بشكل صارم بين الاسترجاع اللغوي المحلي عبر Ollama (Qwen + BGE-M3) وبين المحرك الحتمي لفحص المتطلبات السابقة وحساب الساعات المعتمدة، مع الإفصاح الكامل عن فجوات البيانات (1,655 فجوة) وتعارضات الموقع (53 تعارضاً).'
              : 'Evidence-grounded academic advising across 25 represented program and department entries at Al-Quds University. Strictly separates local Ollama RAG retrieval (Qwen chat + BGE-M3 embeddings) from deterministic Python/TypeScript prerequisite and credit evaluation, while transparently surfacing 1,655 data gaps and 53 website conflicts.'}
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('chat')}
              className="px-4 py-2 text-sm font-medium text-white bg-[#0F5257] hover:bg-[#0B3E42] rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              <span>{isAr ? 'افتح المرشد الأكاديمي (RAG)' : 'Open AI Advisor Chat'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('planner')}
              className="px-4 py-2 text-sm font-medium text-stone-800 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {isAr ? 'مخطط الدراسة الموجه (فحص حتمي)' : 'Guided Study Planner'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('courses')}
              className="px-4 py-2 text-sm font-medium text-stone-700 hover:text-stone-900 underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              {isAr ? 'استعراض دليل المساقات' : 'Explore Course Catalog'}
            </button>
          </div>
        </div>
      </section>

      {/* Dataset Diagnostics & Verified Inventory Grid */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">
              {isAr
                ? '01. مقاييس حزمة البيانات الموثقة والقيود المنهجية'
                : '01. Observed Dataset Scope & Methodological Guardrails'}
            </h2>
            <p className="text-xs text-stone-600">
              {isAr
                ? 'هذه الأرقام تمثل مؤشرات فحص الاستيراد (Import Diagnostics) من ملف alquds_expanded_dataset(1).zip وليست دليلاً على اكتمال الخطط الدراسية.'
                : 'These counts represent import diagnostics from alquds_expanded_dataset(1).zip, not proof of curriculum completeness.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('evidence')}
            className="text-xs font-medium text-[#0F5257] hover:underline whitespace-nowrap shrink-0 flex items-center gap-1"
          >
            <span>{isAr ? 'عرض سجل المصادر والتعارضات الكامل' : 'View Full Provenance & Conflicts'}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white border border-stone-200 rounded-lg p-4">
            <div className="text-xs text-stone-500">
              {isAr ? 'سجلات مساق-برنامج' : 'Program-Course Rows'}
            </div>
            <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-stone-900">
              {EXPECTED_DATASET_DIAGNOSTICS.program_course_records.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-stone-500">
              {isAr ? 'محفوظة على مستوى السجل' : 'Row-level preserved'}
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-lg p-4">
            <div className="text-xs text-stone-500">
              {isAr ? 'أرقام مساقات فريدة' : 'Distinct Course Codes'}
            </div>
            <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-stone-900">
              {EXPECTED_DATASET_DIAGNOSTICS.distinct_course_numbers.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-stone-500">
              {isAr ? '7 خانات نصية (حفظ الأصفار)' : '7-digit strings (leading 0s)'}
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-lg p-4">
            <div className="text-xs text-stone-500">
              {isAr ? 'برامج وأقسام ممثلة' : 'Programs & Depts'}
            </div>
            <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-stone-900">
              {EXPECTED_DATASET_DIAGNOSTICS.represented_programs_departments}
            </div>
            <div className="mt-1 text-[11px] text-stone-500">
              {isAr ? 'شاملة تنبيه MED القسمي' : 'Includes MED dept caveat'}
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-lg p-4">
            <div className="text-xs text-stone-500">
              {isAr ? 'قواعد المتطلبات السابقة' : 'Prerequisite Rules'}
            </div>
            <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-stone-900">
              {EXPECTED_DATASET_DIAGNOSTICS.prerequisite_rules_total}
            </div>
            <div className="mt-1 text-[11px] text-stone-500 font-mono tabular-nums">
              912 parsed · 40 raw · 12 ambig
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-lg p-4">
            <div className="text-xs text-stone-500">
              {isAr ? 'تعارضات الموقع الرسمي' : 'Website Conflicts'}
            </div>
            <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-[#8C2D19]">
              {EXPECTED_DATASET_DIAGNOSTICS.website_conflicts}
            </div>
            <div className="mt-1 text-[11px] text-stone-500">
              {isAr ? 'مُعلنة بدون دمج عشوائي' : 'Surfaced, never hidden'}
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-lg p-4">
            <div className="text-xs text-stone-500">
              {isAr ? 'فجوات البيانات الموثقة' : 'Recorded Data Gaps'}
            </div>
            <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-amber-800">
              {EXPECTED_DATASET_DIAGNOSTICS.data_gaps.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-stone-500">
              {isAr ? 'تحدّ من الجزم الآلي' : 'Constrain advice scope'}
            </div>
          </div>
        </div>
      </section>

      {/* Hard Exclusions & Local Runtime Setup Split */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <div className="bg-white border border-stone-200 rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#8C2D19]">
              <FileWarning className="w-4 h-4 shrink-0" />
              <span>
                {isAr
                  ? 'قائمة الاستبعاد الصارم (Hard Exclusions — Fake Demo Data & Non-Policy Files)'
                  : 'Hard Exclusions List (Synthetic Timetables & Non-Policy Files)'}
              </span>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              {isAr
                ? 'تمت برمجة خط الاستيراد (backend/ingest/importer.py) لاستبعاد الملفات التالية نهائياً من قاعدة البيانات والفهرس الدلالي ومنع استخدامها في أي إجابة أو تخطيط فصلي:'
                : 'The ingestion pipeline (backend/ingest/importer.py) strictly blocks the following files from entering factual tables, search indexes, or study recommendations:'}
            </p>
          </div>

          <div className="divide-y divide-stone-200 border-t border-b border-stone-200">
            {EXCLUDED_SYNTHETIC_ASSETS.map((item) => (
              <div key={item.file} className="py-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-stone-900">
                    {item.file}
                  </span>
                  <span className="text-[11px] text-[#8C2D19] font-medium">
                    {isAr ? 'مستبعد تماماً (Excluded)' : 'Strictly Excluded'}
                  </span>
                </div>
                <p className="text-xs text-stone-600">
                  {isAr ? item.reason_ar : item.reason_en}
                </p>
              </div>
            ))}
          </div>

          <div className="text-xs text-stone-600">
            {isAr
              ? '• تنبيه إضافي: السجلات الـ 1,617 في plan_course_requirements.csv المصنفة كـ recommended لا تعني أن كل مساق إجباري للتخرج، وتاريخ التحقق (last_verified_at) لا يعني تاريخ سريان اللائحة.'
              : '• Additional guard: The 1,617 rows labeled "recommended" in plan_course_requirements.csv are not proof of mandatory status, and last_verified_at is never treated as a policy effective date.'}
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-stone-800">
              <Terminal className="w-4 h-4 shrink-0 text-[#0F5257]" />
              <span>
                {isAr
                  ? 'حالة التشغيل المحلي وخطوات ربط FastAPI + Ollama + ChromaDB'
                  : 'Local Runtime Status & FastAPI + Ollama + ChromaDB Commands'}
              </span>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              {backendConnected
                ? isAr
                  ? 'خادم Python FastAPI المحلي متصل حالياً. يمكنك التحقق من حالة نموذج Ollama وقاعدة بيانات SQLite أدناه.'
                  : 'Local Python FastAPI server is connected. Inspect your Ollama model and SQLite dataset readiness below.'
                : isAr
                  ? 'أنت تتصفح الواجهة حالياً من بيئة المعاينة السحابية (AI Studio Preview) حيث لا يعمل خادم Python FastAPI أو Ollama المحلي. لتشغيل النظام الكامل محلياً بدون أي اعتماد سحابي:'
                  : 'You are viewing the UI in the cloud preview where local Python FastAPI and local Ollama are not running. To run the full stack locally with zero cloud LLM calls:'}
            </p>
          </div>

          <div className="bg-stone-900 text-stone-100 rounded-lg p-4 font-mono text-xs overflow-x-auto space-y-1.5" dir="ltr">
            <div className="text-stone-400"># 1. Discover local Qwen tag & pull embedding model</div>
            <div>ollama list</div>
            <div>ollama pull qwen2.5:3b &amp;&amp; ollama pull bge-m3</div>
            <div className="text-stone-400 pt-1"># 2. Ingest alquds_expanded_dataset(1).zip into SQLite + FTS5</div>
            <div>python3 -m backend.ingest.importer --zip "./alquds_expanded_dataset(1).zip"</div>
            <div className="text-stone-400 pt-1"># 3. Start local FastAPI backend (port 8000) &amp; Vite frontend (port 3000)</div>
            <div>uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload</div>
            <div>npm run dev</div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600 pt-1">
            <span>
              {isAr ? 'نموذج المحادثة المحلي (قابل للتخصيص):' : 'Configurable Local Chat Model:'}{' '}
              <code className="font-mono text-stone-900">
                {health?.ollama?.configured_chat_model || 'OLLAMA_CHAT_MODEL (e.g. qwen2.5:3b)'}
              </code>
            </span>
            <span>
              {isAr ? 'نموذج التضمين:' : 'Embedding Model:'}{' '}
              <code className="font-mono text-stone-900">
                {health?.ollama?.configured_embed_model || 'OLLAMA_EMBED_MODEL (bge-m3)'}
              </code>
            </span>
          </div>
        </div>
      </section>

      {/* Starter Grounded & Refusal Questions */}
      <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-stone-900">
              {isAr
                ? '02. نماذج أسئلة لاختبار الاسترجاع الموثق وحالات الرفض المنهجي'
                : '02. Sample Queries to Test Grounded Retrieval & Refusal Guards'}
            </h2>
            <p className="text-xs text-stone-600">
              {isAr
                ? 'اضغط على أي سؤال لفتحه في شاشة المرشد الأكاديمي.'
                : 'Select any question to load it into the AI Advisor workspace.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {starterQuestions.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() =>
                onSelectQuestionForChat(isAr ? item.q_ar : item.q_en, item.programId)
              }
              className="text-start p-4 rounded-lg border border-stone-200 hover:border-[#0F5257] hover:bg-stone-50/70 transition-colors space-y-1.5 group"
            >
              <div className="flex items-center justify-between gap-2 text-xs text-stone-500">
                <span>{isAr ? item.tag_ar : item.tag_en}</span>
                {item.programId && (
                  <span className="font-mono text-[11px] text-stone-600">{item.programId}</span>
                )}
              </div>
              <div className="text-sm font-medium text-stone-900 group-hover:text-[#0F5257]">
                {isAr ? item.q_ar : item.q_en}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 25 Represented Programs & Departments Table */}
      <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-stone-900">
              {isAr
                ? `03. البرامج والأقسام الأكاديمية الممثلة في الحزمة (${programs.length} مدخلاً)`
                : `03. Represented Program & Department Entries (${programs.length} Entries)`}
            </h2>
            <p className="text-xs text-stone-600">
              {isAr
                ? 'يوضح الجدول مستوى التوثيق لكل برنامج والقيود الخاصة مثل قوائم المساقات القسمية (MED).'
                : 'Displays each program’s evidence level and scope caveats such as departmental-only MED listings.'}
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setTierFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                tierFilter === 'all'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {isAr ? 'الكل (25)' : 'All (25)'}
            </button>
            <button
              type="button"
              onClick={() => setTierFilter('partial_planning')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                tierFilter === 'partial_planning'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {isAr ? 'تخطيط جزئي' : 'Partial Planning'}
            </button>
            <button
              type="button"
              onClick={() => setTierFilter('catalog_only')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                tierFilter === 'catalog_only'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {isAr ? 'دليل مساقات فقط' : 'Catalog-Only'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-stone-200 rounded-lg">
          <table className="w-full text-start border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600">
                <th className="py-2.5 px-3 font-semibold text-start">
                  {isAr ? 'الرمز' : 'Code'}
                </th>
                <th className="py-2.5 px-3 font-semibold text-start">
                  {isAr ? 'البرنامج / القسم الأكاديمي' : 'Program / Department'}
                </th>
                <th className="py-2.5 px-3 font-semibold text-start">
                  {isAr ? 'مستوى التوثيق' : 'Evidence Tier'}
                </th>
                <th className="py-2.5 px-3 font-semibold text-end font-mono">
                  {isAr ? 'سجلات المساقات' : 'Catalog Rows'}
                </th>
                <th className="py-2.5 px-3 font-semibold text-end font-mono">
                  {isAr ? 'قواعد المتطلبات' : 'Prereq Rules'}
                </th>
                <th className="py-2.5 px-3 font-semibold text-start">
                  {isAr ? 'ملاحظات النطاق والقيود' : 'Scope & Caveat Notes'}
                </th>
                <th className="py-2.5 px-3 font-semibold text-end">
                  {isAr ? 'إجراء' : 'Action'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {filteredPrograms.map((prog) => (
                <tr key={prog.program_id} className="hover:bg-stone-50/80 transition-colors">
                  <td className="py-2.5 px-3 font-mono font-semibold text-stone-900 whitespace-nowrap">
                    {prog.program_id}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-stone-900">
                      {isAr ? prog.name_ar : prog.name_en}
                    </div>
                    <div className="text-[11px] text-stone-500">
                      {isAr ? prog.name_en : prog.name_ar}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {prog.is_departmental_listing_only ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-[#8C2D19] shrink-0" />
                      ) : prog.evidence_level === 'partial_planning' ? (
                        <Database className="w-3.5 h-3.5 text-[#0F5257] shrink-0" />
                      ) : (
                        <BookOpen className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      )}
                      <span
                        className={
                          prog.is_departmental_listing_only
                            ? 'text-[#8C2D19] font-semibold'
                            : 'text-stone-800'
                        }
                      >
                        {evidenceLabel(prog.evidence_level)}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-end font-mono tabular-nums text-stone-800">
                    {prog.course_row_count}
                  </td>
                  <td className="py-2.5 px-3 text-end font-mono tabular-nums text-stone-800">
                    {prog.prereq_rule_count}
                  </td>
                  <td className="py-2.5 px-3 text-stone-600 max-w-md">
                    {isAr ? prog.caveat_note_ar : prog.caveat_note_en}
                  </td>
                  <td className="py-2.5 px-3 text-end whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onSelectProgramForPlanner(prog.program_id)}
                      className="px-2.5 py-1 text-xs font-medium text-[#0F5257] hover:bg-[#0F5257]/10 rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      {isAr ? 'اختر في المخطط' : 'Plan Track'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Verified CSV Schema Summary */}
      <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
          <CheckCircle2 className="w-4 h-4 text-[#0F5257]" />
          <span>
            {isAr
              ? '04. جرد ملفات البيانات المعتمدة في طبقة الاسترجاع والفحص الحتمي'
              : '04. Verified Source Inventory Inspected on Import'}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {VERIFIED_CSV_INVENTORY.map((item) => (
            <div
              key={item.file}
              className="p-3.5 rounded-lg border border-stone-200 bg-stone-50/40 space-y-1"
            >
              <div className="font-mono text-xs font-semibold text-stone-900">{item.file}</div>
              <div className="text-xs text-stone-600">
                {isAr ? item.scope_ar : item.scope_en}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
