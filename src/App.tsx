/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckSquare,
  Compass,
  FileCheck2,
  Globe,
  Lock,
  Menu,
  MessageSquare,
  RefreshCw,
  X,
} from 'lucide-react';
import { AdvisorChatView } from './components/AdvisorChatView';
import { CourseExplorerView } from './components/CourseExplorerView';
import { GuidedPlannerView } from './components/GuidedPlannerView';
import { HomeOverview } from './components/HomeOverview';
import { PortalSettingsView } from './components/PortalSettingsView';
import { SourcesEvidenceView } from './components/SourcesEvidenceView';
import { REPRESENTED_25_PROGRAMS } from './data/verifiedReferenceData';
import {
  checkBackendHealth,
  fetchPrograms,
  preserveSevenDigitCode,
} from './services/apiClient';
import {
  HealthResponse,
  Language,
  NavigationTab,
  ProgramEntry,
  StudentCourseEntry,
  StudentCourseStatus,
} from './types/advisor';

const LOCAL_STORAGE_PROGRESS_KEY = 'alquds_advisor_manual_progress_v1';

const DEFAULT_MANUAL_COURSES: StudentCourseEntry[] = [
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
];

export default function App() {
  // Arabic RTL default with instant English LTR toggle (confirmed Phase 1 user preference)
  const [lang, setLang] = useState<Language>('ar');
  const [activeTab, setActiveTab] = useState<NavigationTab>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Backend & Catalog readiness state
  const [backendConnected, setBackendConnected] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(true);
  const [programs, setPrograms] = useState<ProgramEntry[]>(REPRESENTED_25_PROGRAMS);

  // Cross-view handoff states
  const [pendingChatQuestion, setPendingChatQuestion] = useState<string | undefined>(undefined);
  const [pendingChatProgram, setPendingChatProgram] = useState<string | undefined>(undefined);
  const [plannerProgramId, setPlannerProgramId] = useState<string>('COMP-BS');

  // Student-entered manual course progress in browser localStorage (never stores credentials)
  const [studentCourses, setStudentCourses] = useState<StudentCourseEntry[]>(() => {
    try {
      const saved = window.localStorage.getItem(LOCAL_STORAGE_PROGRESS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage parse error
    }
    return DEFAULT_MANUAL_COURSES;
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    try {
      if (studentCourses.length === 0) {
        window.localStorage.removeItem(LOCAL_STORAGE_PROGRESS_KEY);
      } else {
        window.localStorage.setItem(
          LOCAL_STORAGE_PROGRESS_KEY,
          JSON.stringify(studentCourses)
        );
      }
    } catch {
      // Ignore quota errors
    }
  }, [studentCourses]);

  const refreshConnection = useCallback(async () => {
    setCheckingHealth(true);
    try {
      const [healthRes, progRes] = await Promise.all([
        checkBackendHealth(),
        fetchPrograms(),
      ]);
      setBackendConnected(healthRes.connected);
      setHealth(healthRes.health);
      setPrograms(progRes.programs);
    } finally {
      setCheckingHealth(false);
    }
  }, []);

  useEffect(() => {
    refreshConnection();
  }, [refreshConnection]);

  const isAr = lang === 'ar';

  const handleSelectQuestionForChat = (question: string, programId?: string) => {
    setPendingChatQuestion(question);
    setPendingChatProgram(programId);
    setActiveTab('chat');
  };

  const handleSelectProgramForPlanner = (programId: string) => {
    setPlannerProgramId(programId);
    setActiveTab('planner');
  };

  const handleAddCourseToPlanner = (courseNumber: string, status: StudentCourseStatus) => {
    const norm = preserveSevenDigitCode(courseNumber);
    if (!norm) return;
    setStudentCourses((prev) => [
      ...prev.filter((c) => !(c.course_number === norm && c.status === status)),
      {
        course_number: norm,
        status,
        is_repeat: false,
        is_transfer_or_substitution: false,
      },
    ]);
  };

  const navItems: Array<{
    id: NavigationTab;
    labelAr: string;
    labelEn: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'home', labelAr: 'الرئيسية', labelEn: 'Overview', icon: Compass },
    { id: 'chat', labelAr: 'المرشد الذكي', labelEn: 'AI Advisor', icon: MessageSquare },
    { id: 'courses', labelAr: 'دليل المساقات', labelEn: 'Course Explorer', icon: BookOpen },
    { id: 'planner', labelAr: 'مخطط الدراسة', labelEn: 'Study Planner', icon: CheckSquare },
    { id: 'evidence', labelAr: 'المصادر والتعارضات', labelEn: 'Sources & Evidence', icon: FileCheck2 },
    { id: 'portals', labelAr: 'ربط البوابات', labelEn: 'Portal Settings', icon: Lock },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-stone-900">
      {/* Top Bar Contract: 3 Zones (Brand Wordmark — Concise Single-Line Nav Links — 1 Primary Action) */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-white border-b border-stone-200 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('home');
          }}
          className="text-base sm:text-lg font-bold tracking-tight text-stone-900 whitespace-nowrap shrink-0"
        >
          {isAr ? 'مرشد جامعة القدس الأكاديمي' : 'Al-Quds Academic Advisor'}
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav
          aria-label={isAr ? 'التنقل الرئيسي' : 'Main Navigation'}
          className="hidden lg:flex items-center gap-6 text-xs font-medium text-stone-600"
        >
          {navItems.slice(0, 5).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`hover:text-stone-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
                activeTab === item.id
                  ? 'text-[#0F5257] font-semibold underline underline-offset-8 decoration-2'
                  : ''
              }`}
            >
              {isAr ? item.labelAr : item.labelEn}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 primary action (Instant RTL/LTR Language Switcher + mobile menu button) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setLang((prev) => (prev === 'ar' ? 'en' : 'ar'))}
            className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#0F5257] hover:bg-[#0B3E42] rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{isAr ? 'English (LTR)' : 'العربية (RTL)'}</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="lg:hidden p-2 text-stone-700 hover:bg-stone-100 rounded-lg"
            aria-label={isAr ? 'فتح القائمة' : 'Toggle menu'}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b border-stone-200 px-6 py-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg ${
                  activeTab === item.id
                    ? 'bg-[#0F5257]/10 text-[#0F5257] font-semibold'
                    : 'text-stone-700 hover:bg-stone-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{isAr ? item.labelAr : item.labelEn}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Workspace Canvas (Sidebar + Content Area) */}
      <div className="flex-1 flex max-w-[1440px] w-full mx-auto">
        {/* Persistent Desktop Sidebar (260px width) */}
        <aside className="hidden lg:flex flex-col justify-between w-[260px] shrink-0 border-e border-stone-200 bg-white p-5">
          <div className="space-y-6">
            <div className="space-y-1">
              <div className="text-[11px] text-stone-500">
                {isAr ? 'مساحة العمل الأكاديمية' : 'Academic Workspace'}
              </div>
              <div className="text-xs font-semibold text-stone-800">
                {isAr
                  ? 'جامعة القدس — مشروع طلابي مستقل'
                  : 'Al-Quds University — Student Project'}
              </div>
            </div>

            <nav className="space-y-1" aria-label={isAr ? 'أقسام النظام' : 'Workspace Sections'}>
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#0F5257] text-white'
                        : 'text-stone-700 hover:bg-stone-100 hover:text-stone-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{isAr ? item.labelAr : item.labelEn}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Honest Runtime Telemetry Box in Sidebar */}
          <div className="p-3.5 rounded-lg border border-stone-200 bg-stone-50/70 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-stone-800">
                {isAr ? 'حالة الخادم المحلي' : 'Local Runtime'}
              </span>
              <button
                type="button"
                onClick={refreshConnection}
                disabled={checkingHealth}
                className="text-[#0F5257] hover:underline flex items-center gap-1 text-[11px]"
              >
                <RefreshCw className={`w-3 h-3 ${checkingHealth ? 'animate-spin' : ''}`} />
                <span>{isAr ? 'فحص' : 'Check'}</span>
              </button>
            </div>
            <div className="text-[11px] space-y-1 text-stone-600">
              <div>
                FastAPI:{' '}
                <strong className={backendConnected ? 'text-emerald-700' : 'text-[#8C2D19]'}>
                  {backendConnected ? 'Connected' : 'Local backend not connected'}
                </strong>
              </div>
              <div>
                Ollama:{' '}
                <span className="font-mono">
                  {health?.ollama?.ollama_reachable
                    ? health.ollama.configured_chat_model
                    : 'Offline (127.0.0.1:11434)'}
                </span>
              </div>
              <div>
                Portals:{' '}
                <span className="font-mono text-stone-700">not_connected (read-only)</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Viewport Content */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Mandatory Conspicuous Banner When Local Python/Ollama Is Inaccessible */}
          {!backendConnected && (
            <div
              role="status"
              className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#8C2D19] shrink-0 mt-0.5" />
                <div className="space-y-0.5 text-xs">
                  <div className="font-bold text-stone-900">
                    Local backend not connected — الخادم المحلي (Python FastAPI / Ollama) غير متصل
                  </div>
                  <p className="text-stone-700 leading-relaxed">
                    {isAr
                      ? 'تعمل هذه المعاينة السحابية بوضع الواجهة فقط (UI-Only Preview). لا يتم أبداً محاكاة إجابات ذكاء اصطناعي حية أو تسجيل دخول للبوابة الجامعية. لتشغيل الاسترجاع الحقيقي، شغّل خادم Python FastAPI و Ollama محلياً.'
                      : 'Running in UI-Only Cloud Preview. Live AI answers, portal logins, and synchronized student records are never simulated. Start local Python FastAPI (port 8000) and local Ollama (127.0.0.1:11434) for live RAG inference.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={refreshConnection}
                className="px-3 py-1.5 text-xs font-medium bg-white border border-amber-300 hover:border-stone-400 text-stone-800 rounded-lg whitespace-nowrap shrink-0 self-start sm:self-center"
              >
                {isAr ? 'إعادة فحص الاتصال المحلي' : 'Retry Local Connection'}
              </button>
            </div>
          )}

          {activeTab === 'home' && (
            <HomeOverview
              lang={lang}
              backendConnected={backendConnected}
              health={health}
              programs={programs}
              onNavigate={setActiveTab}
              onSelectQuestionForChat={handleSelectQuestionForChat}
              onSelectProgramForPlanner={handleSelectProgramForPlanner}
            />
          )}

          {activeTab === 'chat' && (
            <AdvisorChatView
              lang={lang}
              backendConnected={backendConnected}
              health={health}
              programs={programs}
              initialQuestion={pendingChatQuestion}
              initialProgramId={pendingChatProgram}
              onClearInitialQuestion={() => {
                setPendingChatQuestion(undefined);
                setPendingChatProgram(undefined);
              }}
            />
          )}

          {activeTab === 'courses' && (
            <CourseExplorerView
              lang={lang}
              backendConnected={backendConnected}
              programs={programs}
              onAddCourseToPlanner={handleAddCourseToPlanner}
            />
          )}

          {activeTab === 'planner' && (
            <GuidedPlannerView
              lang={lang}
              backendConnected={backendConnected}
              programs={programs}
              selectedProgramId={plannerProgramId}
              onSelectProgramId={setPlannerProgramId}
              studentCourses={studentCourses}
              onUpdateStudentCourses={setStudentCourses}
            />
          )}

          {activeTab === 'evidence' && (
            <SourcesEvidenceView lang={lang} backendConnected={backendConnected} />
          )}

          {activeTab === 'portals' && (
            <PortalSettingsView lang={lang} backendConnected={backendConnected} />
          )}
        </main>
      </div>

      {/* Quiet Academic Disclaimer Footer */}
      <footer className="bg-white border-t border-stone-200 px-6 py-4 text-xs text-stone-500">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            {isAr
              ? 'مشروع طلابي مستقل (Al-Quds AI Academic Advisor) — غير معتمد رسمياً من جامعة القدس ولا يمثل موافقة رسمية على التسجيل.'
              : 'Independent student project (Al-Quds AI Academic Advisor) — not endorsed by Al-Quds University and never substitutes for official academic registration approval.'}
          </div>
          <div className="font-mono text-[11px]">
            Local RAG (SQLite + ChromaDB + Ollama) · Zero Fine-Tuning
          </div>
        </div>
      </footer>
    </div>
  );
}
