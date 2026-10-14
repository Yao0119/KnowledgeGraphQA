"""DeepSeek 设置探针的回归测试。

重点验证测试连接使用表单里的临时 Key，而不是旧的运行时配置。
"""

import unittest
from unittest.mock import patch

from backend.core import config
from backend.utils import settings_store


class _FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class LLMSettingsProbeTest(unittest.TestCase):
    @patch("backend.utils.settings_store.requests.get")
    def test_deepseek_probe_uses_temporary_values(self, mock_get):
        mock_get.return_value = _FakeResponse(
            200,
            {"data": [{"id": "deepseek-flash"}, {"id": "deepseek-v4-pro"}]},
        )

        result = settings_store.test_llm_settings(
            api_key="sk-from-form",
            provider="deepseek",
            model="deepseek-flash",
            base_url="https://api.deepseek.com/",
        )

        self.assertTrue(result["ok"])
        called = mock_get.call_args
        self.assertEqual(called.args[0], "https://api.deepseek.com/models")
        self.assertEqual(
            called.kwargs["headers"]["Authorization"],
            "Bearer sk-from-form",
        )

    @patch("backend.utils.settings_store.requests.get")
    def test_deepseek_probe_rejects_unknown_model(self, mock_get):
        mock_get.return_value = _FakeResponse(
            200,
            {"data": [{"id": "deepseek-flash"}]},
        )

        result = settings_store.test_llm_settings(
            api_key="sk-from-form",
            provider="deepseek",
            model="missing-model",
            base_url="https://api.deepseek.com",
        )

        self.assertFalse(result["ok"])
        self.assertIn("missing-model", result["message"])

    @patch("backend.utils.settings_store.requests.get")
    def test_deepseek_probe_does_not_mutate_runtime_config(self, mock_get):
        mock_get.return_value = _FakeResponse(
            200,
            {"data": [{"id": "deepseek-flash"}]},
        )
        original_key = config.DEEPSEEK_API_KEY
        original_model = config.DEEPSEEK_MODEL

        settings_store.test_llm_settings(
            api_key="sk-from-form",
            provider="deepseek",
            model="deepseek-flash",
        )

        self.assertEqual(config.DEEPSEEK_API_KEY, original_key)
        self.assertEqual(config.DEEPSEEK_MODEL, original_model)


if __name__ == "__main__":
    unittest.main()
