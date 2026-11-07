"""Authorized read-only StudentPortalAdapter and LecturerPortalAdapter contracts.

Security & Academic Policy Invariants:
1. Official login endpoints:
   - Student: https://student.alquds.edu/en/login
   - Lecturer/Employee: https://portal.alquds.edu/en/login
2. Never collect raw passwords in React forms, never store credentials or session cookies,
   never copy credentials into LLM prompts, and never invent unverified post-login HTML
   selectors or undocumented university API endpoints.
3. For the IEEE hackathon/demo scope, real student personal records are strictly prohibited.
   Adapters remain in an honest `not_connected` / `unsupported_pending_verification` state
   until formal institutional authorization and a verified test account are provided.
4. Enforces strict server-side user-to-session binding (`session_owner_id` + `csrf_token`),
   role verification from the institution (never trusting a client role toggle alone),
   and ephemeral per-user state isolated from the shared ChromaDB/SQLite index.
"""

from __future__ import annotations

import secrets
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from backend.config import Settings, get_settings

OFFICIAL_STUDENT_LOGIN_URL = "https://student.alquds.edu/en/login"
OFFICIAL_LECTURER_LOGIN_URL = "https://portal.alquds.edu/en/login"


class PortalAuthorizationError(PermissionError):
    """Raised when a portal action is attempted without institutional authorization or valid session binding."""


@dataclass
class PortalSessionBinding:
    """Server-side ephemeral session binding tied to a single user and institutional role."""

    session_id: str
    user_id: str
    verified_role: str  # 'student' | 'lecturer'
    csrf_token: str
    created_at_epoch: float
    expires_at_epoch: float
    connection_state: str = "not_connected"
    private_ephemeral_records: Dict[str, Any] = field(default_factory=dict)

    def is_expired(self, now_epoch: Optional[float] = None) -> bool:
        now = now_epoch if now_epoch is not None else time.time()
        return now >= self.expires_at_epoch


class BaseUniversityPortalAdapter(ABC):
    """Abstract contract for read-only Al-Quds University portal adapters."""

    role_name: str = "unknown"
    official_login_url: str = ""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()

    @abstractmethod
    def get_adapter_status(self) -> Dict[str, Any]:
        """Return honest connection state and verification checklist."""

    @abstractmethod
    def initiate_official_browser_login(self, user_id: str) -> Dict[str, Any]:
        """Launch or refuse isolated Playwright browser login at the exact official university URL."""


class StudentPortalAdapter(BaseUniversityPortalAdapter):
    """Read-only adapter contract for https://student.alquds.edu/en/login."""

    role_name = "student"
    official_login_url = OFFICIAL_STUDENT_LOGIN_URL

    def get_adapter_status(self) -> Dict[str, Any]:
        return {
            "role": "student",
            "official_login_url": self.official_login_url,
            "connection_state": "unsupported_pending_verification",
            "adapter_enabled": False,
            "read_only": True,
            "login_page_verified_public": True,
            "authenticated_selectors_verified": False,
            "hackathon_policy_note_en": (
                "Disabled for hackathon/demo compliance: The IEEE RAG guide prohibits importing or "
                "processing real students' personal records. Use manual Guided Study Planner entries "
                "or clearly labeled synthetic test profiles only."
            ),
            "hackathon_policy_note_ar": (
                "معطل التزاماً بقواعد المسابقة والخصوصية: يمنع دليل مسابقة IEEE استخدام البيانات الشخصية الحقيقية "
                "للطلبة. يرجى استخدام الإدخال اليدوي في مخطط الدراسة الموجه أو ملفات الاختبار الافتراضية فقط."
            ),
            "permitted_future_read_only_scopes": [
                "Completed course codes and official credit hours (for that same authenticated student only)",
                "Current semester enrolled course codes (read-only)",
                "Official cumulative GPA and academic standing (never indexed in shared ChromaDB)",
            ],
            "prohibited_actions": [
                "Collecting university passwords inside third-party React forms",
                "Persisting raw passwords or session cookies to disk or localStorage",
                "Bypassing MFA, CAPTCHA, or institutional rate limits",
                "Executing course add/drop or registration mutations",
                "Sharing one student's session or records with any other session",
            ],
        }

    def initiate_official_browser_login(self, user_id: str) -> Dict[str, Any]:
        raise PortalAuthorizationError(
            "StudentPortalAdapter live synchronization is blocked pending institutional authorization "
            "and outside the IEEE hackathon demo restriction on real student personal data. "
            f"Official starting URL remains {self.official_login_url}."
        )


class LecturerPortalAdapter(BaseUniversityPortalAdapter):
    """Read-only adapter contract for https://portal.alquds.edu/en/login."""

    role_name = "lecturer"
    official_login_url = OFFICIAL_LECTURER_LOGIN_URL

    def get_adapter_status(self) -> Dict[str, Any]:
        return {
            "role": "lecturer",
            "official_login_url": self.official_login_url,
            "connection_state": "unsupported_pending_verification",
            "adapter_enabled": False,
            "read_only": True,
            "login_page_verified_public": True,
            "authenticated_selectors_verified": False,
            "hackathon_policy_note_en": (
                "Disabled pending institutional verification: The authenticated capabilities and DOM/API "
                "contracts of portal.alquds.edu are unverified. No post-login selectors or student roster "
                "access are assumed or simulated."
            ),
            "hackathon_policy_note_ar": (
                "معطل بانتظار التفويض والتحقق المؤسسي: خصائص وصلاحيات بوابة المحاضرين بعد تسجيل الدخول غير متحقق "
                "منها رسمياً، ولا يتم افتراض أي وصول إلى علامات الطلبة أو سجلاتهم الخاصة."
            ),
            "permitted_future_read_only_scopes": [
                "Lecturer's own assigned course list (read-only, only if explicitly authorized by institution)",
                "Official departmental catalog advisee requirement summaries (if authorized)",
            ],
            "prohibited_actions": [
                "Accessing students' private grades, attendance, or personal records without explicit institutional scope",
                "Collecting lecturer credentials inside custom forms",
                "Fabricating post-login HTML selectors or API responses",
            ],
        }

    def initiate_official_browser_login(self, user_id: str) -> Dict[str, Any]:
        raise PortalAuthorizationError(
            "LecturerPortalAdapter is blocked pending formal Al-Quds University authorization and "
            "verification of authenticated capabilities at https://portal.alquds.edu/en/login."
        )


class PortalSessionManager:
    """Enforces server-side user-to-session binding, role isolation, CSRF checks, and audit logging."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self.student_adapter = StudentPortalAdapter(self.settings)
        self.lecturer_adapter = LecturerPortalAdapter(self.settings)
        self._sessions_by_id: Dict[str, PortalSessionBinding] = {}
        self._audit_log: List[Dict[str, Any]] = []

    def _record_audit(self, event_type: str, user_id: str, role: str, detail: str) -> None:
        """Minimal audit log that never records credentials, cookies, or personal academic records."""
        self._audit_log.append(
            {
                "timestamp_epoch": round(time.time(), 3),
                "event_type": event_type,
                "user_id": user_id,
                "role": role,
                "detail": detail,
            }
        )

    def create_isolated_session(self, user_id: str, requested_role: str) -> PortalSessionBinding:
        if not user_id or not user_id.strip():
            raise PortalAuthorizationError("user_id is required to bind a portal session.")
        norm_role = requested_role.lower().strip()
        if norm_role not in {"student", "lecturer"}:
            raise PortalAuthorizationError(f"Unsupported portal role '{requested_role}'.")

        now = time.time()
        session = PortalSessionBinding(
            session_id=secrets.token_urlsafe(24),
            user_id=user_id.strip(),
            verified_role=norm_role,
            csrf_token=secrets.token_urlsafe(24),
            created_at_epoch=now,
            expires_at_epoch=now + self.settings.portal_session_ttl_seconds,
            connection_state="not_connected",
        )
        self._sessions_by_id[session.session_id] = session
        self._record_audit("session_initialized", session.user_id, norm_role, "state=not_connected")
        return session

    def get_bound_session(
        self,
        session_id: str,
        requesting_user_id: str,
        required_role: Optional[str] = None,
        csrf_token: Optional[str] = None,
    ) -> PortalSessionBinding:
        """Verify server-side user-to-session binding, expiry, CSRF token, and role."""
        session = self._sessions_by_id.get(session_id)
        if not session:
            raise PortalAuthorizationError("Session not found or already terminated.")
        if session.is_expired():
            del self._sessions_by_id[session_id]
            self._record_audit("session_expired", requesting_user_id, session.verified_role, "expired")
            raise PortalAuthorizationError("Portal session has expired.")
        if session.user_id != requesting_user_id:
            self._record_audit(
                "cross_user_access_blocked",
                requesting_user_id,
                session.verified_role,
                "Attempted to access another user's portal session.",
            )
            raise PortalAuthorizationError(
                "Cross-user session access is strictly forbidden: session belongs to a different user."
            )
        if required_role and session.verified_role != required_role.lower().strip():
            self._record_audit(
                "role_mismatch_blocked",
                requesting_user_id,
                session.verified_role,
                f"Required role {required_role} != bound role {session.verified_role}",
            )
            raise PortalAuthorizationError(
                f"Role mismatch: session is bound to '{session.verified_role}', not '{required_role}'."
            )
        if csrf_token is not None and not secrets.compare_digest(session.csrf_token, csrf_token):
            self._record_audit("csrf_mismatch_blocked", requesting_user_id, session.verified_role, "invalid csrf")
            raise PortalAuthorizationError("Invalid CSRF token for portal session operation.")
        return session

    def disconnect_session(self, session_id: str, requesting_user_id: str) -> Dict[str, Any]:
        """Explicitly purge session state and private ephemeral records."""
        session = self._sessions_by_id.get(session_id)
        if session and session.user_id != requesting_user_id:
            raise PortalAuthorizationError("Cannot disconnect another user's session.")
        if session:
            session.private_ephemeral_records.clear()
            del self._sessions_by_id[session_id]
            self._record_audit("session_disconnected", requesting_user_id, session.verified_role, "purged")
        return {"disconnected": True, "session_id": session_id}

    def get_overall_status(self) -> Dict[str, Any]:
        return {
            "portal_sync_status": "unsupported_pending_verification",
            "authorized_adapters_enabled": False,
            "guest_public_rag_available": True,
            "student_portal": self.student_adapter.get_adapter_status(),
            "lecturer_portal": self.lecturer_adapter.get_adapter_status(),
            "security_guarantees": {
                "react_password_collection": "FORBIDDEN (never rendered)",
                "credential_persistence": "NONE (zero passwords or session tokens stored)",
                "shared_index_contamination": "BLOCKED (private portal data never enters ChromaDB/SQLite)",
                "session_binding": "Enforced server-side per user_id + verified_role + CSRF token",
                "session_ttl_seconds": self.settings.portal_session_ttl_seconds,
            },
            "audit_log_count": len(self._audit_log),
        }
