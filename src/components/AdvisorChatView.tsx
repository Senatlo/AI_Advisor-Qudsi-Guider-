import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Eye,
  Send,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { ILLUSTRATIVE_SHOWCASE_EXAMPLES } from '../data/verifiedReferenceData';
import { submitAdvisorChat } from '../services/apiClient';
import {
  ChatResponse,
  HealthResponse,
  Language,
  ProgramEntry,
} from '../types/advisor';

interface AdvisorChatViewProps {
  lang: Language;
  backendConnected: boolean;
  health: HealthResponse | null;
  programs: ProgramEntry[];
  initialQuestion?: string;
  initialProgramId?: string;
  onClearInitialQuestion?: () => void;
}

interface ConversationItem {
  id: string;
  query: string;
  programId: string;
  response: ChatResponse;
  timestamp: string;
}

export const AdvisorChatView: React.FC<AdvisorChatViewProps> = ({
  lang,
  backendConnected,
  health,
  programs,
  initialQuestion,
  initialProgramId,
  onClearInitialQuestion,
}) => {
  const isAr = lang === 'ar';
  const [query, setQuery] = useState(initialQuestion || '');
  const [selectedProgram, setSelectedProgram] = useState(initialProgramId || '');
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<ConversationItem[]>([]);
  const [showIllustrativeShowcase, setShowIllustrativeShowcase] = useState(!backendConnected);

  useEffect(() => {
    if (initialQuestion) {
      setQuery(initialQuestion);
      if (initialProgramId !== undefined) {
        setSelectedProgram(initialProgramId);
      }
      if (onClearInitialQuestion) {
        onClearInitialQuestion();
      }
    }
  }, [initialQuestion, initialProgramId, onClearInitialQuestion]);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      const sessionHistory = history
        .filter((h) => !h.response.is_illustrative_demo && h.response.status === 'answered')
        .slice(-4)
        .flatMap((h) => [
          { role: 'user' as const, content: h.query },
          {
            role: 'assistant' as const,
            content: h.response.answer || h.response.answer_ar || h.response.answer_en || '',
          },
        ]);

      const resp = await submitAdvisorChat({
        query: trimmed,
        program_id: selectedProgram || undefined,
        session_history: sessionHistory,
      });

      setHistory((prev) => [
        {
          id: `turn_${Date.now()}`,
          query: trimmed,
          programId: selectedProgram,
          response: resp,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  const loadIllustrativeExample = (exampleId: string) => {
    const ex = ILLUSTRATIVE_SHOWCASE_EXAMPLES.find((item) => item.id === exampleId);
    if (!ex) return;
    setHistory((prev) => [
      {
        id: `demo_${Date.now()}`,
        query: isAr ? ex.query_ar : ex.query_en,
        programId: 'COMP-BS',
        response: ex.response,
        timestamp: new Date().toLocaleTimeString(),
      },
      ...prev,
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Header & Local Model Status */}
      <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-stone-900">
              {isAr
                ? 'المرشد الأكاديمي الموثق (RAG المحلي — جامعة القدس فقط)'
                : 'Grounded Academic Advisor Chat (Local RAG — Al-Quds University Only)'}
            </h1>
            <p className="text-xs text-stone-600">
              {isAr
                ? 'يربط كل معلومة أكاديمية بسجل المساق أو الوثيقة الرسمية (ChunkID / CourseNumber / SourceURL) ويرفض الأسئلة خارج النطاق أو المعتمدة على جداول تجريبية.'
                : 'Links every academic claim to retrieved catalog rows or verified policy passages (ChunkID / CourseNumber / SourceURL) and refuses out-of-scope or synthetic schedule queries.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600">
            <span>
              {isAr ? 'الخادم المحلي:' : 'FastAPI Backend:'}{' '}
              <strong className={backendConnected ? 'text-emerald-700' : 'text-[#8C2D19]'}>
                {backendConnected
                  ? isAr
                    ? 'متصل'
                    : 'Connected'
                  : isAr
                    ? 'غير متصل (معاينة سحابية)'
                    : 'Not Connected'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {isAr ? 'نموذج Ollama:' : 'Ollama Model:'}{' '}
              <code className="font-mono text-stone-900">
                {health?.ollama?.configured_chat_model || 'OLLAMA_CHAT_MODEL'}
              </code>
            </span>
          </div>
        </div>

        {/* Query Form */}
        <form onSubmit={handleAsk} className="space-y-3 pt-2 border-t border-stone-200">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-1">
              <label
                htmlFor="advisor-program-filter"
                className="block text-xs font-medium text-stone-700 mb-1"
              >
                {isAr ? 'تخصيص البرنامج (اختياري)' : 'Program Filter (Optional)'}
              </label>
              <select
                id="advisor-program-filter"
                value={selectedProgram}
                onChange={(e) => setSelectedProgram(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-lg text-stone-900 focus:outline-none focus:border-[#0F5257]"
              >
                <option value="">
                  {isAr ? 'جميع البرامج الممثلة (25)' : 'All Represented Programs (25)'}
                </option>
                {programs.map((p) => (
                  <option key={p.program_id} value={p.program_id}>
                    {p.program_id} — {isAr ? p.name_ar : p.name_en}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <label
                htmlFor="advisor-query-input"
                className="block text-xs font-medium text-stone-700 mb-1"
              >
                {isAr
                  ? 'اكتب سؤالك الأكاديمي (بالعربية الفصحى أو العامية أو الإنجليزية)'
                  : 'Enter your academic question (Arabic or English)'}
              </label>
              <div className="flex gap-2">
                <input
                  id="advisor-query-input"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    isAr
                      ? 'مثال: ما هو المتطلب السابق لمساق 0302102 تراكيب البيانات؟'
                      : 'e.g., What is the prerequisite for course 0302102 Data Structures?'
                  }
                  className="flex-1 px-3.5 py-2 text-sm bg-white border border-stone-300 rounded-lg text-stone-900 focus:outline-none focus:border-[#0F5257]"
                />
                <button
                  type="submit"
                  disabled={submitting || !query.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#0F5257] hover:bg-[#0B3E42] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {submitting
                      ? isAr
                        ? 'جاري الفحص...'
                        : 'Querying...'
                      : isAr
                        ? 'إرسال للخادم المحلي'
                        : 'Ask Local Backend'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </form>
      </section>

      {/* Honest UI Showcase Inspector when Local Backend is Disconnected */}
      {!backendConnected && (
        <section className="bg-amber-50/70 border border-amber-300 rounded-xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {isAr
                  ? 'الخادم المحلي غير متصل (Local backend not connected) — لا يتم أبداً تزييف إجابة ذكاء اصطناعي حية'
                  : 'Local backend not connected — Live AI answers are never simulated or faked'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowIllustrativeShowcase((v) => !v)}
              className="text-xs font-medium text-[#0F5257] hover:underline flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>
                {showIllustrativeShowcase
                  ? isAr
                    ? 'إخفاء بطاقات العرض التوضيحية'
                    : 'Hide Illustrative UI Cards'
                  : isAr
                    ? 'إظهار بطاقات العرض التوضيحية (UI Demo)'
                    : 'Show Illustrative UI Demo Cards'}
              </span>
            </button>
          </div>

          {showIllustrativeShowcase && (
            <div className="space-y-3 pt-2 border-t border-amber-200">
              <p className="text-xs text-stone-700">
                {isAr
                  ? 'يمكنك معاينة هيكل بطاقة الاستشهاد الموثقة وبطاقة الرفض المنهجي أدناه. كل بطاقة موسومة بوضوح بعبارة "Illustrative UI demo — not a live academic answer":'
                  : 'You can inspect the citation card layout and refusal structure below. Every showcase card is explicitly labeled "Illustrative UI demo — not a live academic answer":'}
              </p>
              <div className="flex flex-wrap gap-2">
                {ILLUSTRATIVE_SHOWCASE_EXAMPLES.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => loadIllustrativeExample(ex.id)}
                    className="px-3 py-1.5 text-xs font-medium bg-white border border-stone-300 hover:border-[#0F5257] text-stone-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    {isAr ? ex.label_ar : ex.label_en}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Conversation Responses & Citations */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-800">
            {isAr
              ? `سجل الجلسة الحالية (${history.length})`
              : `Current Session Responses (${history.length})`}
          </h2>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => setHistory([])}
              className="text-xs text-stone-600 hover:text-[#8C2D19] flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isAr ? 'مسح سجل الجلسة' : 'Clear Session'}</span>
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl p-8 text-center space-y-2">
            <p className="text-sm font-medium text-stone-800">
              {isAr
                ? 'لا توجد استعلامات في هذه الجلسة بعد.'
                : 'No queries submitted in this session yet.'}
            </p>
            <p className="text-xs text-stone-500 max-w-xl mx-auto">
              {isAr
                ? 'اطرح سؤالاً أعلاه للاتصال بخادم FastAPI المحلي، أو اضغط على أحد الأمثلة التوضيحية لمعاينة تصميم بطاقات الأدلة والرفض.'
                : 'Submit a question above to query your local FastAPI server, or load one of the labeled illustrative UI cards above.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((item) => {
              const resp = item.response;
              const isRefusal =
                resp.status === 'refused' ||
                resp.status === 'backend_disconnected' ||
                resp.status === 'ollama_unavailable';

              return (
                <article
                  key={item.id}
                  className="bg-white border border-stone-200 rounded-xl p-6 space-y-4"
                >
                  {/* Illustrative UI Demo Mandatory Notice */}
                  {resp.is_illustrative_demo && (
                    <div className="p-2.5 rounded-lg bg-amber-100/90 border border-amber-300 text-amber-950 text-xs font-semibold flex items-center justify-between gap-2">
                      <span>Illustrative UI demo — not a live academic answer</span>
                      <span>
                        {isAr
                          ? 'عرض توضيحي للواجهة فقط — ليس إجابة أكاديمية حية'
                          : 'Static UI structure preview'}
                      </span>
                    </div>
                  )}

                  {/* User Question Header */}
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-200 pb-3">
                    <div className="text-sm font-semibold text-stone-900">{item.query}</div>
                    <div className="flex items-center gap-2 text-xs text-stone-500 font-mono">
                      {item.programId && <span>{item.programId}</span>}
                      <span aria-hidden="true">·</span>
                      <span>{item.timestamp}</span>
                    </div>
                  </div>

                  {/* Response Body */}
                  {isRefusal ? (
                    <div className="p-4 rounded-lg bg-red-50/70 border border-red-200 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#8C2D19]">
                        <ShieldAlert className="w-4 h-4 shrink-0" />
                        <span>
                          {resp.status === 'backend_disconnected'
                            ? 'Local backend not connected'
                            : resp.status === 'ollama_unavailable'
                              ? 'Local Ollama model unavailable'
                              : `Structured Refusal (${resp.refusal_type || 'unverified'})`}
                        </span>
                      </div>
                      <p className="text-sm text-stone-800 whitespace-pre-line leading-relaxed">
                        {isAr
                          ? resp.answer_ar || resp.error || resp.answer_en
                          : resp.answer_en || resp.error || resp.answer_ar}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-stone-500 flex flex-wrap items-center gap-2">
                        <span>
                          {isAr ? 'النموذج المستخدم:' : 'Model:'}{' '}
                          <code className="font-mono text-stone-800">
                            {resp.model_used || 'Local Qwen'}
                          </code>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {isAr
                            ? 'عدد المراجع المسترجعة:'
                            : 'Retrieved Evidence Chunks:'}{' '}
                          <strong className="font-mono">{resp.citations.length}</strong>
                        </span>
                      </div>
                      <div className="text-sm text-stone-900 whitespace-pre-line leading-relaxed">
                        {resp.answer}
                      </div>
                    </div>
                  )}

                  {/* Conflict Warnings if present */}
                  {resp.conflicts && resp.conflicts.length > 0 && (
                    <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>
                          {isAr
                            ? 'تعارض مسجل في المصادر الرسمية لهذا المساق:'
                            : 'Recorded Website Conflict on Retrieved Course:'}
                        </span>
                      </div>
                      {resp.conflicts.map((c) => (
                        <div key={c.conflict_id} className="text-xs text-stone-700">
                          <span className="font-mono font-semibold">{c.course_number}</span> ({c.field_name}):{' '}
                          Source A = <code className="font-mono">{c.value_source_a}</code> vs Source B ={' '}
                          <code className="font-mono">{c.value_source_b}</code>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Citations List */}
                  {resp.citations && resp.citations.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-stone-200">
                      <div className="text-xs font-semibold text-stone-700">
                        {isAr
                          ? 'الأدلة والمصادر المسترجعة (تاريخ التحقق last_verified_at لا يُعد تاريخ سريان لائحة):'
                          : 'Retrieved Evidence & Provenance (last_verified_at is NOT an effective policy date):'}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {resp.citations.map((cit) => (
                          <div
                            key={cit.chunk_id}
                            className="p-3 rounded-lg border border-stone-200 bg-stone-50/60 space-y-1.5 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-semibold text-[#0F5257]">
                                {cit.course_number || cit.chunk_id}
                              </span>
                              <span className="font-mono text-[11px] text-stone-500">
                                Chunk: {cit.chunk_id} · {cit.program_id || 'General'}
                              </span>
                            </div>
                            <div className="font-medium text-stone-900">
                              {cit.title_ar ? `${cit.title_ar} — ${cit.title_en}` : cit.title_en}
                            </div>
                            <p className="text-stone-600 text-[11px] leading-relaxed">
                              {cit.excerpt}
                            </p>
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-stone-500">
                              <span>
                                Verified: <code className="font-mono">{cit.last_verified_at || 'N/A'}</code>
                              </span>
                              {cit.source_url && (
                                <a
                                  href={cit.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#0F5257] hover:underline flex items-center gap-1"
                                >
                                  <span>{isAr ? 'المصدر الرسمي' : 'Official Source'}</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
