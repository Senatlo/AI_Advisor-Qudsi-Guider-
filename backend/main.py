"""FastAPI entrypoint for the Al-Quds AI Academic Advisor local backend.

Run locally with:
    uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
Or with the stdlib fallback server if FastAPI/uvicorn are not yet installed:
    python3 -m backend.main
"""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse

from backend.config import get_settings
from backend.service import AdvisorBackendService

service = AdvisorBackendService()
settings = get_settings()

try:
    from fastapi import FastAPI, HTTPException, Query
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field

    class ChatTurnModel(BaseModel):
        role: str = Field(..., pattern="^(user|assistant)$")
        content: str = Field(..., min_length=1, max_length=4000)

    class ChatRequestModel(BaseModel):
        query: str = Field(..., min_length=1, max_length=2000)
        program_id: Optional[str] = Field(default=None, max_length=100)
        session_history: Optional[List[ChatTurnModel]] = Field(default=None)

    class StudentCourseInputModel(BaseModel):
        course_number: str = Field(..., min_length=1, max_length=20)
        status: str = Field(
            default="completed",
            pattern="^(completed|in_progress|failed_not_passed|desired)$",
        )
        is_repeat: bool = False
        is_transfer_or_substitution: bool = False

    class PlannerEvaluateRequestModel(BaseModel):
        program_id: str = Field(..., min_length=1, max_length=100)
        student_courses: List[StudentCourseInputModel] = Field(default_factory=list)
        target_courses: Optional[List[str]] = Field(default=None)

    app = FastAPI(
        title="Al-Quds AI Academic Advisor — Local Backend API",
        description=(
            "Independent student project scoped strictly to Al-Quds University. "
            "Uses local SQLite + ChromaDB + local Ollama (Qwen chat + BGE-M3 embeddings)."
        ),
        version="1.0.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Accept"],
    )

    @app.get("/api/health")
    async def api_health() -> Dict[str, Any]:
        return service.get_health()

    @app.get("/api/knowledge/status")
    async def api_knowledge_status() -> Dict[str, Any]:
        return service.get_knowledge_status()

    @app.get("/api/programs")
    async def api_programs() -> Dict[str, Any]:
        return service.get_programs()

    @app.get("/api/courses")
    async def api_courses(
        q: str = Query(default="", max_length=200),
        program_id: str = Query(default="", max_length=100),
        has_conflict: Optional[bool] = Query(default=None),
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=25, ge=1, le=100),
    ) -> Dict[str, Any]:
        return service.get_courses(
            q=q,
            program_id=program_id,
            has_conflict=has_conflict,
            page=page,
            page_size=page_size,
        )

    @app.get("/api/courses/{course_number}")
    async def api_course_detail(course_number: str) -> Dict[str, Any]:
        result = service.get_course_detail(course_number)
        if not result.get("found"):
            raise HTTPException(
                status_code=404,
                detail=f"Course '{course_number}' not found in official Al-Quds catalog.",
            )
        return result

    @app.post("/api/chat")
    def api_chat(req: ChatRequestModel) -> Dict[str, Any]:
        history = (
            [{"role": t.role, "content": t.content} for t in req.session_history]
            if req.session_history
            else None
        )
        return service.rag.answer_question(
            query=req.query,
            program_id=req.program_id,
            session_history=history,
        )

    @app.post("/api/planner/evaluate")
    async def api_planner_evaluate(req: PlannerEvaluateRequestModel) -> Dict[str, Any]:
        courses_payload = [
            {
                "course_number": c.course_number,
                "status": c.status,
                "is_repeat": c.is_repeat,
                "is_transfer_or_substitution": c.is_transfer_or_substitution,
            }
            for c in req.student_courses
        ]
        return service.planner.evaluate_plan(
            program_id=req.program_id,
            student_courses=courses_payload,
            target_courses=req.target_courses,
        )

    @app.get("/api/portal/status")
    async def api_portal_status() -> Dict[str, Any]:
        return service.portals.get_overall_status()

    @app.get("/api/evidence")
    async def api_evidence(limit: int = Query(default=100, ge=1, le=500)) -> Dict[str, Any]:
        return service.get_evidence(limit=limit)

except ImportError:
    app = None  # FastAPI not installed in minimal container; stdlib server available below


class _StdlibAdvisorHandler(BaseHTTPRequestHandler):
    """Minimal stdlib HTTP handler exposing the exact same REST endpoints when FastAPI is absent."""

    def _send_json(self, status_code: int, payload: Dict[str, Any]) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "http://localhost:3000")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send_json(200, {"ok": True})

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        path = parsed.path.rstrip("/")

        if path == "/api/health":
            self._send_json(200, service.get_health())
        elif path == "/api/knowledge/status":
            self._send_json(200, service.get_knowledge_status())
        elif path == "/api/programs":
            self._send_json(200, service.get_programs())
        elif path == "/api/courses":
            q = (qs.get("q") or [""])[0]
            pid = (qs.get("program_id") or [""])[0]
            page = int((qs.get("page") or ["1"])[0])
            page_size = int((qs.get("page_size") or ["25"])[0])
            self._send_json(
                200,
                service.get_courses(q=q, program_id=pid, page=page, page_size=page_size),
            )
        elif path.startswith("/api/courses/"):
            cnum = path.split("/api/courses/", 1)[1]
            res = service.get_course_detail(cnum)
            self._send_json(200 if res.get("found") else 404, res)
        elif path == "/api/portal/status":
            self._send_json(200, service.portals.get_overall_status())
        elif path == "/api/evidence":
            self._send_json(200, service.get_evidence())
        else:
            self._send_json(404, {"error": f"Unknown endpoint {path}"})

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        length = int(self.headers.get("Content-Length", "0"))
        body_raw = self.rfile.read(length).decode("utf-8", errors="replace") if length > 0 else "{}"
        try:
            body = json.loads(body_raw)
        except ValueError:
            self._send_json(400, {"error": "Invalid JSON request body."})
            return

        if path == "/api/chat":
            query = str(body.get("query", "")).strip()
            if not query:
                self._send_json(422, {"error": "Field 'query' is required."})
                return
            self._send_json(
                200,
                service.rag.answer_question(
                    query=query,
                    program_id=body.get("program_id"),
                    session_history=body.get("session_history"),
                ),
            )
        elif path == "/api/planner/evaluate":
            pid = str(body.get("program_id", "")).strip()
            if not pid:
                self._send_json(422, {"error": "Field 'program_id' is required."})
                return
            self._send_json(
                200,
                service.planner.evaluate_plan(
                    program_id=pid,
                    student_courses=body.get("student_courses") or [],
                    target_courses=body.get("target_courses"),
                ),
            )
        else:
            self._send_json(404, {"error": f"Unknown POST endpoint {path}"})


def run_stdlib_server() -> None:
    server = HTTPServer((settings.backend_host, settings.backend_port), _StdlibAdvisorHandler)
    print(
        f"Al-Quds AI Academic Advisor backend listening on http://{settings.backend_host}:{settings.backend_port}"
    )
    server.serve_forever()


if __name__ == "__main__":
    run_stdlib_server()
