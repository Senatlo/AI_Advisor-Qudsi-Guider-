"""Local Ollama HTTP client for model discovery (/api/tags), embeddings (/api/embed), and chat (/api/chat).

Strictly local: never calls Gemini or any cloud LLM/embedding service.
Never silently substitutes a fallback model if the user's configured OLLAMA_CHAT_MODEL
or OLLAMA_EMBED_MODEL is missing from `ollama list` / `/api/tags`.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

from backend.config import Settings, get_settings


class OllamaServiceError(RuntimeError):
    """Raised when local Ollama is unreachable or a required model tag is not installed."""


class LocalOllamaClient:
    """Communicates exclusively with the local Ollama daemon (default http://127.0.0.1:11434)."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self.base_url = self.settings.ollama_base_url.rstrip("/")
        self.chat_model = self.settings.ollama_chat_model
        self.embed_model = self.settings.ollama_embed_model
        self.timeout = self.settings.ollama_timeout_seconds

    def _request_json(
        self,
        method: str,
        path: str,
        payload: Optional[Dict[str, Any]] = None,
        timeout: Optional[float] = None,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = urllib.request.Request(
            url=url,
            data=data,
            method=method,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout or self.timeout) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                return json.loads(raw) if raw.strip() else {}
        except urllib.error.HTTPError as exc:
            err_body = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
            raise OllamaServiceError(
                f"Ollama HTTP {exc.code} on {path}: {err_body[:300]}"
            ) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise OllamaServiceError(
                f"Local Ollama daemon unreachable at {self.base_url} ({exc}). "
                "Ensure Ollama is running locally (`ollama serve`) and never expose it publicly."
            ) from exc

    def inspect_readiness(self) -> Dict[str, Any]:
        """Query GET /api/tags to discover installed models and verify configured tags."""
        try:
            tags_resp = self._request_json("GET", "/api/tags", timeout=4.0)
        except OllamaServiceError as exc:
            return {
                "ollama_reachable": False,
                "base_url": self.base_url,
                "configured_chat_model": self.chat_model,
                "configured_embed_model": self.embed_model,
                "chat_model_installed": False,
                "embed_model_installed": False,
                "installed_models": [],
                "discovered_qwen_candidates": [],
                "error": str(exc),
                "actionable_guidance": [
                    "1. Install and start Ollama locally: `ollama serve`",
                    "2. Check installed models: `ollama list`",
                    f"3. Pull your chosen Qwen chat model: `ollama pull {self.chat_model}`",
                    f"4. Pull the multilingual embedding model: `ollama pull {self.embed_model}`",
                ],
            }

        models_raw = tags_resp.get("models", [])
        installed_names: List[str] = [
            str(m.get("name", "")).strip() for m in models_raw if m.get("name")
        ]

        def _matches_tag(configured: str, installed: List[str]) -> bool:
            if not configured:
                return False
            for tag in installed:
                if tag == configured or tag == f"{configured}:latest":
                    return True
            return False

        chat_ok = _matches_tag(self.chat_model, installed_names)
        embed_ok = _matches_tag(self.embed_model, installed_names)
        qwen_candidates = [m for m in installed_names if "qwen" in m.lower()]

        guidance: List[str] = []
        if not chat_ok:
            guidance.append(
                f"Configured OLLAMA_CHAT_MODEL='{self.chat_model}' is not installed. "
                f"Run `ollama pull {self.chat_model}` or set OLLAMA_CHAT_MODEL in .env to one of your "
                f"installed Qwen models ({', '.join(qwen_candidates) or 'none detected'})."
            )
        if not embed_ok:
            guidance.append(
                f"Configured OLLAMA_EMBED_MODEL='{self.embed_model}' is not installed. "
                f"Run `ollama pull {self.embed_model}`."
            )

        return {
            "ollama_reachable": True,
            "base_url": self.base_url,
            "configured_chat_model": self.chat_model,
            "configured_embed_model": self.embed_model,
            "chat_model_installed": chat_ok,
            "embed_model_installed": embed_ok,
            "installed_models": installed_names,
            "discovered_qwen_candidates": qwen_candidates,
            "error": None if (chat_ok and embed_ok) else "Missing required local model tag(s).",
            "actionable_guidance": guidance,
        }

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings via local Ollama POST /api/embed using OLLAMA_EMBED_MODEL."""
        if not texts:
            return []
        readiness = self.inspect_readiness()
        if not readiness["ollama_reachable"]:
            raise OllamaServiceError(readiness["error"] or "Ollama unreachable.")
        if not readiness["embed_model_installed"]:
            raise OllamaServiceError(
                f"Embedding model '{self.embed_model}' is not installed in local Ollama. "
                f"Run `ollama pull {self.embed_model}`."
            )
        resp = self._request_json(
            "POST",
            "/api/embed",
            payload={"model": self.embed_model, "input": texts},
        )
        embeddings = resp.get("embeddings")
        if not isinstance(embeddings, list):
            raise OllamaServiceError("Unexpected response shape from Ollama /api/embed.")
        return embeddings

    def generate_chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.0,
    ) -> Dict[str, Any]:
        """Run grounded chat inference via local Ollama POST /api/chat using OLLAMA_CHAT_MODEL."""
        readiness = self.inspect_readiness()
        if not readiness["ollama_reachable"]:
            raise OllamaServiceError(readiness["error"] or "Ollama unreachable.")
        if not readiness["chat_model_installed"]:
            raise OllamaServiceError(
                f"Chat model '{self.chat_model}' is not installed in local Ollama (never silently "
                f"substituted). Installed Qwen tags: {readiness['discovered_qwen_candidates']}."
            )
        resp = self._request_json(
            "POST",
            "/api/chat",
            payload={
                "model": self.chat_model,
                "messages": messages,
                "stream": False,
                "think": False,
                "options": {"temperature": temperature, "num_ctx": 4096},
            },
        )
        msg = resp.get("message", {})
        content = msg.get("content")
        if not isinstance(content, str) or not content.strip():
            raise OllamaServiceError("Local model returned an empty answer. No academic answer was generated.")
        return {
            "model_used": resp.get("model", self.chat_model),
            "content": content.strip(),
        }
