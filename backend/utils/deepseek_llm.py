"""
DeepSeek 云端 LLM 客户端

接口形态刻意与 Ollama 客户端保持一致（`is_available()` / `chat()` / `generate()` /
`get_available_models()`），这样上层的 agent.py、reasoning.py、prediction.py
不需要关心当前用的是哪个后端。

官方文档要点（https://api-docs.deepseek.com/）：
  * base_url          https://api.deepseek.com
  * 对话端点           POST /chat/completions（OpenAI 兼容格式）
  * 鉴权              Authorization: Bearer <DEEPSEEK_API_KEY>
  * 模型名            `deepseek-flash`（对应模型版本 DeepSeek-V4.1-Flash）
                      旧名 `deepseek-v4-flash` 仍被接受；`deepseek-v4-pro` 为更强版本
  * 思考模式          默认**开启**，需要显式传 {"thinking": {"type": "disabled"}} 关闭
"""

import json
from typing import Any, Dict, List, Optional

import requests

from ..core.config import (
    DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL,
    DEEPSEEK_REASONING_EFFORT,
    DEEPSEEK_THINKING,
    DEEPSEEK_TIMEOUT,
    LLM_MAX_TOKENS,
    LLM_TEMPERATURE,
)

# 这些状态码的语义对使用者有指导意义，单独给出可读提示
_STATUS_HINTS = {
    400: "请求格式有误（可能是模型名或参数不被接受）",
    401: "API Key 无效或未提供",
    402: "账户余额不足",
    403: "API Key 无权访问该模型",
    422: "参数校验失败",
    429: "触发限流，请降低频率后重试",
    500: "DeepSeek 服务内部错误",
    503: "DeepSeek 服务暂时不可用",
}


class DeepSeekClient:
    """
    DeepSeek API 客户端

    Attributes:
        api_key: API Key（为空时 is_available() 返回 False）
        base_url: API 基址
        model_name: 模型名
        chat_endpoint: 对话补全端点
        last_error: 最近一次调用的错误信息（便于排查）
    """

    provider = "deepseek"

    def __init__(
        self,
        api_key: str = DEEPSEEK_API_KEY,
        base_url: str = DEEPSEEK_BASE_URL,
        model_name: str = DEEPSEEK_MODEL,
        timeout: int = DEEPSEEK_TIMEOUT,
        thinking: str = DEEPSEEK_THINKING,
        reasoning_effort: str = DEEPSEEK_REASONING_EFFORT,
    ):
        """
        初始化客户端

        Args:
            api_key: DeepSeek API Key，留空表示未配置
            base_url: API 基址，默认 https://api.deepseek.com
            model_name: 模型名，默认 deepseek-flash
            timeout: 单次请求超时（秒）
            thinking: "enabled" / "disabled" / ""（空串表示不传该字段，使用服务端默认）
            reasoning_effort: "low" / "medium" / "high" / ""（空串表示不传）
        """
        self.api_key = (api_key or "").strip()
        self.base_url = (base_url or DEEPSEEK_BASE_URL).rstrip("/")
        self.model_name = model_name or DEEPSEEK_MODEL
        self.timeout = timeout
        self.thinking = (thinking or "").strip().lower()
        self.reasoning_effort = (reasoning_effort or "").strip().lower()
        self.chat_endpoint = f"{self.base_url}/chat/completions"
        self.models_endpoint = f"{self.base_url}/models"
        self.last_error: Optional[str] = None

    # ========================================
    # 可用性
    # ========================================

    def is_available(self) -> bool:
        """
        是否具备调用条件

        与 Ollama 不同，这里不需要"探测服务"，只要配置了 API Key 就认为可用
        （真正的错误会在调用时以可读信息返回）。

        Returns:
            bool: 已配置 API Key 返回 True
        """
        if not self.api_key:
            self.last_error = "未配置 DEEPSEEK_API_KEY"
            return False
        return True

    def get_available_models(self) -> List[str]:
        """
        获取可用模型列表

        先尝试 GET /models；该端点不可用时回退为当前配置的模型。

        Returns:
            list: 模型名列表
        """
        if not self.is_available():
            return []
        try:
            response = requests.get(
                self.models_endpoint,
                headers=self._headers(),
                timeout=10,
            )
            if response.status_code == 200:
                data = response.json()
                names = [m.get("id") for m in data.get("data", []) if m.get("id")]
                if names:
                    return names
        except Exception:
            pass
        return [self.model_name]

    # ========================================
    # 请求构造
    # ========================================

    def _headers(self) -> Dict[str, str]:
        """构造请求头"""
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

    def _build_payload(
        self,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> Dict[str, Any]:
        """
        构造对话补全请求体

        Args:
            messages: 消息列表
            temperature: 采样温度
            max_tokens: 最大生成 token 数

        Returns:
            dict: 请求体
        """
        payload: Dict[str, Any] = {
            "model": self.model_name,
            "messages": messages,
            "temperature": temperature,
            "stream": False,
        }
        if max_tokens and max_tokens > 0:
            payload["max_tokens"] = max_tokens
        # 思考模式默认是开启的，这里按配置显式开关
        if self.thinking in ("enabled", "disabled"):
            payload["thinking"] = {"type": self.thinking}
        if self.reasoning_effort in ("low", "medium", "high"):
            payload["reasoning_effort"] = self.reasoning_effort
        return payload

    @staticmethod
    def _extract_content(data: Dict[str, Any]) -> str:
        """
        从响应中取出正文

        思考模式下正文在 message.content，思维链在 message.reasoning_content；
        若正文为空则退回思维链，避免出现"空回答"。

        Args:
            data: 响应 JSON

        Returns:
            str: 回答正文
        """
        choices = data.get("choices") or []
        if not choices:
            return ""
        message = choices[0].get("message") or {}
        content = (message.get("content") or "").strip()
        if content:
            return content
        return (message.get("reasoning_content") or "").strip()

    def _error_text(self, response: requests.Response) -> str:
        """
        把 HTTP 错误转换为可读信息

        Args:
            response: requests 响应对象

        Returns:
            str: 可读错误信息
        """
        hint = _STATUS_HINTS.get(response.status_code, "请求失败")
        detail = ""
        try:
            body = response.json()
            detail = body.get("error", {}).get("message") or body.get("message") or ""
        except Exception:
            detail = (response.text or "")[:200]
        return f"DeepSeek API 错误 {response.status_code}（{hint}）{': ' + detail if detail else ''}"

    # ========================================
    # 调用接口
    # ========================================

    def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = LLM_TEMPERATURE,
        max_tokens: int = LLM_MAX_TOKENS,
    ) -> Dict[str, Any]:
        """
        多轮对话补全

        Args:
            messages: 消息列表，每项含 role / content
            temperature: 采样温度
            max_tokens: 最大生成 token 数

        Returns:
            dict: 统一形态 {"message": {"content": str}, "usage": {...}, "model": str}
                  调用失败时 content 为可读的错误说明
        """
        if not self.is_available():
            return self._failure("未配置 DEEPSEEK_API_KEY，请在 .env 或环境变量中设置后重启后端")

        try:
            response = requests.post(
                self.chat_endpoint,
                headers=self._headers(),
                json=self._build_payload(messages, temperature, max_tokens),
                timeout=self.timeout,
            )
        except requests.exceptions.Timeout:
            return self._failure(f"DeepSeek API 请求超时（{self.timeout}s）")
        except requests.exceptions.ConnectionError as exc:
            return self._failure(f"无法连接 DeepSeek API（{self.base_url}）: {exc}")
        except Exception as exc:
            return self._failure(f"DeepSeek API 调用异常: {exc}")

        if response.status_code != 200:
            return self._failure(self._error_text(response))

        try:
            data = response.json()
        except json.JSONDecodeError:
            return self._failure("DeepSeek API 返回了非 JSON 内容")

        content = self._extract_content(data)
        if not content:
            return self._failure("DeepSeek API 返回了空回答")

        self.last_error = None
        return {
            "message": {"content": content},
            "model": data.get("model", self.model_name),
            "usage": data.get("usage", {}),
        }

    def generate(
        self,
        prompt: str,
        temperature: float = LLM_TEMPERATURE,
        top_p: float = 0.9,
        max_tokens: int = LLM_MAX_TOKENS,
        stream: bool = False,
    ) -> str:
        """
        单轮文本生成（与 Ollama 客户端保持同名同义）

        Args:
            prompt: 提示词
            temperature: 采样温度
            top_p: 保留参数以兼容 Ollama 客户端签名（DeepSeek 走默认值）
            max_tokens: 最大生成 token 数
            stream: 保留参数；当前始终使用非流式

        Returns:
            str: 生成的文本
        """
        response = self.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.get("message", {}).get("content", "")

    # ========================================
    # 内部工具
    # ========================================

    def _failure(self, message: str) -> Dict[str, Any]:
        """
        构造统一的失败响应

        Args:
            message: 失败原因

        Returns:
            dict: 与 chat() 同形态的响应，content 为失败原因
        """
        self.last_error = message
        return {"message": {"content": message}, "error": True}
