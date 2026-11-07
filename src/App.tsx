import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Compass, FileCheck2, Globe, Menu, MessageSquare, RefreshCw } from 'lucide-react';
import { AdvisorChatView } from './components/AdvisorChatView';
import { LiveCourseExplorer } from './components/LiveCourseExplorer';
import { LiveOverview } from './components/LiveOverview';
import { LiveSourcesView } from './components/LiveSourcesView';
import { checkBackendHealth, fetchPrograms } from './services/apiClient';
import { fetchKnowledgeStatus, KnowledgeStatus } from './services/liveData';
import { HealthResponse, Language, ProgramEntry } from './types/advisor';

type Tab = 'home' | 'chat' | 'courses' | 'evidence';

export default function App() {
  const [lang, setLang] = useState<Language>('ar');
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeStatus | null>(null);
  const [programs, setPrograms] = useState<ProgramEntry[]>([]);
  const [checkingHealth, setCheckingHealth] = useState(true);
  const [catalogProgram, setCatalogProgram] = useState('');
  const ar = lang === 'ar';
  const t = (arabic: string, english: string) => ar ? arabic : english;
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);
  const refreshConnection = useCallback(async () => {
    setCheckingHealth(true);
    try {
      const [connection, catalog, status] = await Promise.all([
        checkBackendHealth(), fetchPrograms(), fetchKnowledgeStatus().catch(() => null),
      ]);
      setBackendConnected(connection.connected);
      setHealth(connection.health);
      setPrograms(catalog.fromLiveBackend ? catalog.programs : []);
      setKnowledge(status);
    } finally { setCheckingHealth(false); }
  }, []);
  useEffect(() => { refreshConnection(); }, [refreshConnection]);
  const nav = [
    { id: 'home' as const, label: t('الرئيسية', 'Overview'), icon: Compass },
    { id: 'chat' as const, label: t('المرشد الذكي', 'AI Advisor'), icon: MessageSquare },
    { id: 'courses' as const, label: t('دليل المساقات', 'Course Explorer'), icon: BookOpen },
    { id: 'evidence' as const, label: t('المصادر والبيانات', 'Sources & Data'), icon: FileCheck2 },
  ];
  const navigate = (tab: Tab) => { setActiveTab(tab); setMobileMenuOpen(false); };
  const browseProgram = (program: string) => { setCatalogProgram(program); navigate('courses'); };
  const navButtons = (sidebar = false) => nav.map(item => <button key={item.id} onClick={() => navigate(item.id)}
    aria-current={activeTab === item.id ? 'page' : undefined}
    className={sidebar ? 'w-full flex items-center gap-3 px-3.5 py-2.5 text-xs rounded-lg ' + (activeTab === item.id ? 'bg-[#0F5257] text-white' : 'text-stone-700 hover:bg-stone-100') : 'text-xs whitespace-nowrap ' + (activeTab === item.id ? 'font-semibold text-[#0F5257] underline underline-offset-8' : 'text-stone-600 hover:text-stone-900')}>
    {sidebar && <item.icon className="w-4 h-4" />}{item.label}
  </button>);
  return <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-stone-900">
    <header className="flex items-center justify-between gap-4 px-6 py-3.5 bg-white border-b border-stone-200 sticky top-0 z-30">
      <button onClick={() => navigate('home')} className="text-base sm:text-lg font-bold text-start">{t('مرشد جامعة القدس الأكاديمي', 'Al-Quds Academic Advisor')}</button>
      <nav aria-label={t('التنقل الرئيسي', 'Main navigation')} className="hidden lg:flex gap-6">{navButtons()}</nav>
      <div className="flex gap-2">
        <button onClick={() => setLang(l => l === 'ar' ? 'en' : 'ar')} className="px-3 py-1.5 text-xs text-white bg-[#0F5257] rounded-lg flex items-center gap-2"><Globe className="w-3.5 h-3.5" />{t('English (LTR)', 'العربية (RTL)')}</button>
        <button onClick={() => setMobileMenuOpen(v => !v)} aria-label={t('القائمة', 'Menu')} aria-expanded={mobileMenuOpen} className="lg:hidden p-2 border rounded-lg"><Menu className="w-4 h-4" /></button>
      </div>
    </header>
    {mobileMenuOpen && <nav aria-label={t('القائمة المحمولة', 'Mobile navigation')} className="lg:hidden bg-white border-b px-4 py-3 space-y-1">{navButtons(true)}</nav>}
    <div className="flex flex-1 w-full max-w-[1440px] mx-auto">
      <aside className="hidden lg:flex w-64 shrink-0 border-e border-stone-200 p-5 flex-col gap-6">
        <div><p className="font-semibold text-sm">{t('مساحة العمل الأكاديمية', 'Academic workspace')}</p><p className="text-xs text-stone-500 mt-1">{t('مشروع طلابي مستقل', 'Independent student project')}</p></div>
        <nav className="space-y-1" aria-label={t('أقسام النظام', 'Workspace sections')}>{navButtons(true)}</nav>
        <section className="p-3.5 rounded-lg border border-stone-200 bg-stone-50 space-y-2 text-xs">
          <div className="flex justify-between gap-2"><span>{t('حالة النظام', 'System status')}</span><button onClick={refreshConnection} disabled={checkingHealth} className="text-[#0F5257] flex items-center gap-1 disabled:opacity-50"><RefreshCw className={'w-3 h-3 ' + (checkingHealth ? 'animate-spin' : '')} />{t('فحص', 'Check')}</button></div>
          <p>{t('الخادم: ', 'Backend: ')}{backendConnected ? t('متصل', 'Connected') : t('غير متصل', 'Disconnected')}</p>
          <p>Ollama: <span dir="ltr">{health?.ollama.ollama_reachable && health.ollama.chat_model_installed ? health.ollama.configured_chat_model : t('غير جاهز', 'Not ready')}</span></p>
        </section>
      </aside>
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">
        {!checkingHealth && !backendConnected && <section role="status" className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm space-y-2"><p>{t('الخادم المحلي غير متصل. لا يمكن تحميل المساقات أو توليد إجابات.', 'The local backend is disconnected. Courses and answers are unavailable.')}</p><button onClick={refreshConnection} className="text-[#0F5257] underline">{t('إعادة فحص الاتصال', 'Retry connection')}</button></section>}
        {activeTab === 'home' && <LiveOverview lang={lang} health={health} knowledge={knowledge} programs={programs} onNavigate={navigate} onBrowseProgram={browseProgram} />}
        {activeTab === 'chat' && <AdvisorChatView lang={lang} backendConnected={backendConnected} health={health} programs={programs} />}
        {activeTab === 'courses' && <LiveCourseExplorer lang={lang} backendConnected={backendConnected} programs={programs} initialProgram={catalogProgram} />}
        {activeTab === 'evidence' && <LiveSourcesView lang={lang} knowledge={knowledge} backendConnected={backendConnected} />}
      </main>
    </div>
    <footer className="bg-white border-t border-stone-200 px-6 py-4 text-xs text-stone-500">{t('مشروع طلابي مستقل غير معتمد رسمياً من جامعة القدس. المعلومات إرشادية ولا تمثل موافقة على التسجيل.', 'Independent student project, not endorsed by Al-Quds University. Information is advisory and does not constitute registration approval.')}</footer>
  </div>;
}
