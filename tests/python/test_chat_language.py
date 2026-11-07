"""The selected page language must reach chat generation, independently of input language."""

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app, service
from backend.rag.retriever import HybridRAGService
from backend.rag.ollama_client import OllamaServiceError


class TestChatLanguage(unittest.TestCase):
    def test_retired_features_are_not_public_api_routes(self):
        with TestClient(app) as client:
            self.assertEqual(client.post('/api/planner/evaluate', json={}).status_code, 404)
            self.assertEqual(client.get('/api/portal/status').status_code, 404)

    def test_api_forwards_language_and_validates_supported_values(self):
        with TestClient(app) as client, patch.object(service.rag, "answer_question", return_value={"status": "answered"}) as answer:
            for language in ["ar", "en"]:
                response = client.post("/api/chat", json={"query": "course", "language": language})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(answer.call_args.kwargs["language"], language)
            response = client.post("/api/chat", json={"query": "course", "language": "fr"})
            self.assertEqual(response.status_code, 422)
            client.post("/api/chat", json={"query": "course"})
            self.assertEqual(answer.call_args.kwargs["language"], "en")

    def test_generation_uses_page_language_despite_question_and_history(self):
        rag = HybridRAGService()
        retrieval = {"refusal": False, "passages": [], "conflicts": [], "gaps": []}
        with patch.object(rag, "retrieve", return_value=retrieval), patch.object(
            rag.ollama, "generate_chat", return_value={"content": "Answer", "model_used": "test"}
        ) as generate:
            for language, label in [("ar", "Arabic"), ("en", "English")]:
                response = rag.answer_question("Question in another language", language=language,
                    session_history=[{"role": "assistant", "content": "Previous reply in a different language"}])
                messages = generate.call_args.kwargs["messages"]
                self.assertIn(f"page language is {label}", messages[0]["content"])
                self.assertIn(f"response in {label}", messages[-1]["content"])
                self.assertEqual(response["language"], language)

    def test_explicit_course_question_does_not_reuse_previous_course_history(self):
        rag = HybridRAGService()
        retrieval = {"refusal": False, "passages": [], "conflicts": [], "gaps": []}
        with patch.object(rag, "retrieve", return_value=retrieval), patch.object(
            rag.ollama, "generate_chat", return_value={"content": "Answer", "model_used": "test"}
        ) as generate:
            history = [{"role": "assistant", "content": "STALE Data Structures 0302102"}]
            for query in ["المتطلب السابق لمساق الداتا بيس", "database prerequisite", "course 0702324"]:
                rag.answer_question(query, language="ar", session_history=history)
                messages = generate.call_args.kwargs["messages"]
                self.assertEqual(len(messages), 2)
                self.assertNotIn("STALE", str(messages))
            rag.answer_question("What about its credits?", session_history=history)
            self.assertEqual(len(generate.call_args.kwargs["messages"]), 3)

    def test_refusals_and_model_errors_have_arabic_messages(self):
        rag = HybridRAGService()
        refusal = {"refusal": True, "refusal_type": "insufficient_evidence", "refusal_message_en": "No policy"}
        with patch.object(rag, "retrieve", return_value=refusal):
            result = rag.answer_question("fees", language="ar")
            self.assertTrue(any('\u0600' <= c <= '\u06ff' for c in result["answer_ar"]))
            self.assertEqual(result["language"], "ar")
        with patch.object(rag, "retrieve", return_value={"refusal": False, "passages": [], "conflicts": [], "gaps": []}), patch.object(
            rag.ollama, "generate_chat", side_effect=OllamaServiceError("Unavailable")
        ):
            result = rag.answer_question("course", language="ar")
            self.assertEqual(result["status"], "ollama_unavailable")
            self.assertTrue(any('\u0600' <= c <= '\u06ff' for c in result["answer_ar"]))


if __name__ == "__main__":
    unittest.main()
