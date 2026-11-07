import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Send,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
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
        .filter((h) => h.response.status === 'answered')
        .slice(0, 4)
        .reverse()
        .flatMap((h) => [
          { role: 'user' as const, content: h.query },
          {
            role: 'assistant' as const,
            content: h.response.answer || h.response.answer_ar || h.response.answer_en || '',
          },
        ]);

      const resp = await submitAdvisorChat({
        query: trimmed,
        language: lang,
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
                  disabled={submitting || !query.trim() || !backendConnected || !health?.ollama?.chat_model_installed}
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
              disabled={submitting}
              className="text-xs text-stone-600 hover:text-[#8C2D19] flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isAr ? 'مسح سجل الجلسة' : 'Clear Session'}</span>
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-sm text-stone-500">
            {isAr ? 'اكتب سؤالك واختر البرنامج للحصول على إجابة من البيانات المحملة.' : 'Enter a question and choose a program to get an answer from the loaded catalog.'}
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
                            ? isAr ? 'الخادم المحلي غير متصل' : 'Local backend not connected'
                            : resp.status === 'ollama_unavailable'
                              ? isAr ? 'نموذج Ollama المحلي غير متاح' : 'Local Ollama model unavailable'
                              : isAr ? 'تعذر تقديم إجابة موثقة' : `Structured Refusal (${resp.refusal_type || 'unverified'})`}
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
                      <div
                        lang={resp.language || lang}
                        dir={(resp.language || lang) === 'ar' ? 'rtl' : 'ltr'}
                        className="text-sm text-stone-900 whitespace-pre-line leading-relaxed"
                      >
                        {resp.answer}
                      </div>
                    </div>
                  )}

                  {resp.conflicts && resp.conflicts.length > 0 && (
                    <p className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                      {isAr
                        ? 'توجد تعارضات مسجلة في بيانات بعض المساقات المسترجعة. راجع المصادر الجامعية قبل الاعتماد عليها.'
                        : 'Some retrieved courses have recorded source conflicts. Check the university sources before relying on them.'}
                    </p>
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
