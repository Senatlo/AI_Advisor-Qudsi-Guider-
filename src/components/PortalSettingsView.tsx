import React, { useState } from 'react';
import {
  ExternalLink,
  Lock,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { Language } from '../types/advisor';

interface PortalSettingsViewProps {
  lang: Language;
  backendConnected: boolean;
}

const OFFICIAL_STUDENT_URL = 'https://student.alquds.edu/en/login';
const OFFICIAL_LECTURER_URL = 'https://portal.alquds.edu/en/login';

export const PortalSettingsView: React.FC<PortalSettingsViewProps> = ({
  lang,
}) => {
  const isAr = lang === 'ar';
  const [selectedRole, setSelectedRole] = useState<'student' | 'lecturer'>('student');

  return (
    <div className="space-y-6">
      {/* Header & Honest Unverified Status Banner */}
      <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-stone-900">
              {isAr
                ? 'إعدادات ربط البوابات الجامعية (الطالب والمحاضر — للقراءة فقط وبانتظار التفويض)'
                : 'University Portal Connection Settings (Student & Lecturer — Read-Only Contracts)'}
            </h1>
            <p className="text-xs text-stone-600">
              {isAr
                ? 'يفصل النظام بين محول بوابة الطالب (StudentPortalAdapter) ومحول بوابة المحاضر (LecturerPortalAdapter) دون جمع كلمات مرور داخل الواجهة أو محاكاة شاشات دخول وهمية.'
                : 'Separates StudentPortalAdapter and LecturerPortalAdapter contracts without collecting passwords in React forms or simulating fake login screens.'}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono bg-amber-50 border border-amber-300 text-amber-950 px-3 py-2 rounded-lg shrink-0">
            <Lock className="w-4 h-4 shrink-0 text-[#8C2D19]" />
            <span>Status: not_connected / unsupported_pending_verification</span>
          </div>
        </div>

        {/* Role Chooser */}
        <div className="pt-2 border-t border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-stone-700">
            <strong>
              {isAr ? 'اختيار الدور لمعاينة عقد الربط:' : 'Select Role to Inspect Adapter Contract:'}
            </strong>{' '}
            {isAr
              ? '(ملاحظة أمنية: اختيار الزر لا يمنح صلاحية دخول؛ يتم التحقق من الدور من المؤسسة عند توفر الربط الرسمي)'
              : '(Security rule: Choosing a role button never grants authorization; role must be verified by the institution when enabled)'}
          </div>

          <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setSelectedRole('student')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                selectedRole === 'student'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {isAr ? 'بوابة الطالب (Student Portal)' : 'Student Portal'}
            </button>
            <button
              type="button"
              onClick={() => setSelectedRole('lecturer')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                selectedRole === 'lecturer'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {isAr ? 'بوابة المحاضر / الموظف (Lecturer Portal)' : 'Lecturer / Employee Portal'}
            </button>
          </div>
        </div>
      </section>

      {/* Selected Role Adapter Card & Security Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {selectedRole === 'student' ? (
          <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <div className="text-xs font-mono text-[#0F5257] font-semibold">
                  backend/portals/adapters.py :: StudentPortalAdapter
                </div>
                <h2 className="text-base font-bold text-stone-900 mt-0.5">
                  {isAr
                    ? 'عقد ربط بوابة الطالب الرسمية (للقراءة فقط)'
                    : 'Official Student Portal Adapter Contract (Read-Only)'}
                </h2>
              </div>
              <span className="text-xs font-mono text-[#8C2D19] font-semibold">
                not_connected
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">
                  {isAr ? 'نقطة البداية الرسمية:' : 'Official Starting URL:'}
                </span>
                <a
                  href={OFFICIAL_STUDENT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[#0F5257] hover:underline flex items-center gap-1"
                >
                  <span>{OFFICIAL_STUDENT_URL}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">
                  {isAr ? 'حالة صفحة الدخول العامة:' : 'Public Login Endpoint:'}
                </span>
                <span className="font-mono text-stone-800">
                  Verified public username/password fields on university host
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">
                  {isAr ? 'محددات الصفحات بعد الدخول (Selectors):' : 'Post-Login DOM/API Selectors:'}
                </span>
                <span className="font-mono text-[#8C2D19] font-semibold">
                  Unverified (Zero selectors invented)
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">
                  {isAr ? 'قيود مسابقة IEEE:' : 'IEEE Hackathon Policy Constraint:'}
                </span>
                <span className="text-stone-800 font-medium">
                  {isAr
                    ? 'يُحظر استيراد أو عرض بيانات شخصية لطلبة حقيقيين'
                    : 'Real student personal records strictly forbidden'}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-stone-700 space-y-1.5">
              <div className="font-semibold text-amber-950 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>
                  {isAr
                    ? 'لماذا لا يوجد نموذج إدخال كلمة مرور هنا؟'
                    : 'Why is there no username/password form on this page?'}
                </span>
              </div>
              <p className="leading-relaxed">
                {isAr
                  ? 'التزاماً بأمن المعلومات، لا يقوم التطبيق أبداً بتقليد بوابة الجامعة أو جمع كلمات مرور الطلبة داخل نماذج React. في حال منحت الجامعة تفويضاً رسمياً مستقبلاً خارج نطاق المسابقة، يقوم المحرك بفتح الموقع الرسمي للجامعة في سياق متصفح معزول أو عبر SSO مفوض دون تخزين أي بيانات سرية.'
                  : 'We never counterfeit the official university portal or collect student passwords inside our React interface. In a future institution-approved deployment outside the hackathon restriction, authentication occurs strictly via delegated institutional SSO or an isolated official browser context.'}
              </p>
            </div>
          </section>
        ) : (
          <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <div className="text-xs font-mono text-[#0F5257] font-semibold">
                  backend/portals/adapters.py :: LecturerPortalAdapter
                </div>
                <h2 className="text-base font-bold text-stone-900 mt-0.5">
                  {isAr
                    ? 'عقد ربط بوابة المحاضر / الموظف الرسمية (للقراءة فقط)'
                    : 'Official Lecturer / Employee Portal Adapter Contract (Read-Only)'}
                </h2>
              </div>
              <span className="text-xs font-mono text-[#8C2D19] font-semibold">
                unsupported_pending_verification
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">
                  {isAr ? 'نقطة البداية الرسمية:' : 'Official Starting URL:'}
                </span>
                <a
                  href={OFFICIAL_LECTURER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[#0F5257] hover:underline flex items-center gap-1"
                >
                  <span>{OFFICIAL_LECTURER_URL}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">
                  {isAr ? 'القدرات الموثقة بعد الدخول:' : 'Authenticated Capabilities:'}
                </span>
                <span className="font-mono text-[#8C2D19] font-semibold">
                  NOT VERIFIED (Pending Institutional Documentation)
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500">
                  {isAr ? 'الوصول لعلامات أو حضور الطلبة:' : 'Access to Student Grades / Attendance:'}
                </span>
                <span className="text-stone-800 font-medium">
                  {isAr
                    ? 'غير مفترض وغير مسموح بدون تفويض صريح'
                    : 'Never assumed or accessed without explicit authorization'}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-stone-50 border border-stone-200 text-xs text-stone-700 space-y-1.5">
              <div className="font-semibold text-stone-900">
                {isAr
                  ? 'نطاق لوحة المحاضر المستقبلية (عند التفويض):'
                  : 'Future Authorized Lecturer Scope:'}
              </div>
              <p className="leading-relaxed">
                {isAr
                  ? 'تقتصر العمليات الأولية على القراءة فقط (READ ONLY) للمساقات المسندة للمحاضر نفسه والسجلات المصرح له بها رسمياً، مع عزل تام للجلسات ومنع مشاركة أي بيانات خاصة في الفهرس المشترك.'
                  : 'Initial operations are strictly READ ONLY for the authenticated lecturer’s own assigned courses and explicitly authorized records, with strict per-user session binding.'}
              </p>
            </div>
          </section>
        )}

        {/* Security & Isolation Invariants */}
        <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
            <ShieldCheck className="w-4 h-4 text-[#0F5257]" />
            <span>
              {isAr
                ? 'الضوابط الأمنية وعزل الجلسات المطبقة برمجياً (PortalSessionManager)'
                : 'Implemented Security Invariants & Session Isolation (PortalSessionManager)'}
            </span>
          </div>

          <ul className="space-y-2.5 text-xs text-stone-700">
            <li className="flex items-start gap-2">
              <UserCheck className="w-4 h-4 text-[#0F5257] shrink-0 mt-0.5" />
              <span>
                <strong>
                  {isAr
                    ? 'ربط الجلسة بالمستخدم والدور على الخادم:'
                    : 'Server-Side User-to-Session & Role Binding:'}
                </strong>{' '}
                {isAr
                  ? 'لا يمكن أبداً استخدام جلسة مستخدم لخدمة مستخدم آخر (مفحوص برمجياً في test_portal_adapters_read_only_and_session_isolation).'
                  : 'A session bound to user_alpha can never be read or disconnected by user_beta, and student/lecturer roles cannot be crossed.'}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <UserCheck className="w-4 h-4 text-[#0F5257] shrink-0 mt-0.5" />
              <span>
                <strong>
                  {isAr
                    ? 'عزل البيانات الخاصة عن الفهرس الدلالي المشترك:'
                    : 'Zero Shared Index Contamination:'}
                </strong>{' '}
                {isAr
                  ? 'لا يتم أبداً إدراج بيانات الطالب الخاصة في ChromaDB أو جداول SQLite العامة.'
                  : 'Private student/lecturer records never enter the shared ChromaDB vector store or public SQLite tables.'}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <UserCheck className="w-4 h-4 text-[#0F5257] shrink-0 mt-0.5" />
              <span>
                <strong>
                  {isAr
                    ? 'حماية ضد حقن الأوامر (Prompt Injection Resistance):'
                    : 'Prompt-Injection & Action Firewall:'}
                </strong>{' '}
                {isAr
                  ? 'النصوص المسترجعة من الدليل تُعامل كبيانات غير قابلة للتنفيذ ولا يُسمح لمخرجات النموذج اللغوي بتنفيذ أي إجراء على البوابة.'
                  : 'Retrieved passages are treated strictly as passive data; LLM outputs cannot invoke portal adapters or private queries.'}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <UserCheck className="w-4 h-4 text-[#0F5257] shrink-0 mt-0.5" />
              <span>
                <strong>
                  {isAr
                    ? 'انتهاء الصلاحية ورموز CSRF وسجل التدقيق الأدنى:'
                    : 'Session Expiry, CSRF Tokens & Minimal Audit Log:'}
                </strong>{' '}
                {isAr
                  ? 'تنتهي الجلسات تلقائياً (TTL = 900s) مع التحقق من رمز CSRF وتسجيل أحداث الأمان دون حفظ أي بيانات حساسة.'
                  : 'Sessions enforce a 900-second TTL, constant-time CSRF token validation, and credential-free audit logging.'}
              </span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
};
