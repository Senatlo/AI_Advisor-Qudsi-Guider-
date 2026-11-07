"""Ensure local chat requests return usable answers rather than reasoning-only output."""

import unittest
from unittest.mock import patch

from backend.rag.ollama_client import LocalOllamaClient, OllamaServiceError


class TestOllamaResponses(unittest.TestCase):
    def test_chat_requests_final_answer_without_thinking(self):
        client = LocalOllamaClient()
        ready = {"ollama_reachable": True, "chat_model_installed": True}
        with patch.object(client, "inspect_readiness", return_value=ready), patch.object(
            client, "_request_json", return_value={"message": {"content": " Answer "}}
        ) as request:
            self.assertEqual(client.generate_chat([])["content"], "Answer")
            self.assertIs(request.call_args.kwargs["payload"]["think"], False)

    def test_empty_final_answer_is_reported_as_an_error(self):
        client = LocalOllamaClient()
        ready = {"ollama_reachable": True, "chat_model_installed": True}
        for content in ["", "  ", None]:
            with patch.object(client, "inspect_readiness", return_value=ready), patch.object(
                client, "_request_json", return_value={"message": {"content": content}}
            ):
                with self.assertRaises(OllamaServiceError):
                    client.generate_chat([])


if __name__ == "__main__":
    unittest.main()
