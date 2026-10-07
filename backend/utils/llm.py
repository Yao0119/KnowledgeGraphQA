"""
LLM 客户端工厂

按 `LLM_PROVIDER` 配置返回对应后端，上层代码只依赖统一的接口：

    client = get_llm_client()          # 单例
    client.is_available()              # 是否可用
    client.chat(messages=[...])        # -> {"message": {"content": "..."}}

目前支持：
    deepseek —— 云端 API（默认），需要 DEEPSEEK_API_KEY
    ollama   —— 本地服务
"""

from typing import Optional, Union

from ..core import config as _config
from .deepseek_llm import DeepSeekClient
from .local_llm import LocalLLMClient

AnyLLMClient = Union[DeepSeekClient, LocalLLMClient]

# 单例
_llm_client: Optional[AnyLLMClient] = None
_active_provider: Optional[str] = None


def create_llm_client(provider: Optional[str] = None) -> AnyLLMClient:
    """
    按 provider 创建客户端（不缓存）

    ⚠️ 这里刻意**显式传参**，而不是依赖各客户端 __init__ 的默认值：
    Python 的默认参数是在**函数定义时**求值的，而 deepseek_llm.py 顶部写的是
        from ..core.config import DEEPSEEK_API_KEY
        def __init__(self, api_key: str = DEEPSEEK_API_KEY, ...)
    也就是说默认值在 import 那一刻就被固化成字符串快照了。
    这样一来，设置页在运行时修改 config.DEEPSEEK_API_KEY 之后，
    DeepSeekClient() 仍然会拿着**旧的空 Key**，表现为"保存成功了但依然提示未配置"。
    改为每次创建时从 config 模块现读，设置页保存后调用 reset_llm_client() 即可生效。

    Args:
        provider: "deepseek" 或 "ollama"；为 None 时使用配置中的 LLM_PROVIDER

    Returns:
        AnyLLMClient: 对应后端的客户端实例

    Raises:
        ValueError: provider 取值不支持
    """
    name = (provider or _config.LLM_PROVIDER or "deepseek").strip().lower()

    if name == "deepseek":
        return DeepSeekClient(
            api_key=_config.DEEPSEEK_API_KEY,
            base_url=_config.DEEPSEEK_BASE_URL,
            model_name=_config.DEEPSEEK_MODEL,
            timeout=_config.DEEPSEEK_TIMEOUT,
            thinking=_config.DEEPSEEK_THINKING,
            reasoning_effort=_config.DEEPSEEK_REASONING_EFFORT,
        )
    if name == "ollama":
        return LocalLLMClient()

    raise ValueError(f"不支持的 LLM_PROVIDER: {name!r}（可选 deepseek / ollama）")


def get_llm_client() -> AnyLLMClient:
    """
    获取全局 LLM 客户端（单例）

    注意：与旧实现不同，这里**即使后端当前不可用也会返回客户端实例**，
    而不可用的原因由 `is_available()` / 调用结果给出。
    这样调用方总能看到"为什么不可用"（例如提示配置 DEEPSEEK_API_KEY），
    而不是拿到一个 None 之后只能打印一句笼统的"服务不可用"。

    Returns:
        AnyLLMClient: LLM 客户端实例
    """
    global _llm_client, _active_provider

    if _llm_client is None:
        _llm_client = create_llm_client()
        _active_provider = getattr(_llm_client, "provider", _config.LLM_PROVIDER)

        if _llm_client.is_available():
            print(f"✅ LLM 客户端初始化成功: provider={_active_provider}, "
                  f"model={getattr(_llm_client, 'model_name', 'unknown')}")
        else:
            print(f"⚠️ LLM 客户端已创建但当前不可用: provider={_active_provider}，"
                  f"原因: {getattr(_llm_client, 'last_error', None) or '未知'}")

    return _llm_client


def reset_llm_client() -> None:
    """
    重置全局 LLM 客户端（切换 provider / 修改配置后调用）
    """
    global _llm_client, _active_provider
    _llm_client = None
    _active_provider = None


def get_llm_info() -> dict:
    """
    获取当前 LLM 配置与可用性（供健康检查与前端展示使用）

    Returns:
        dict: provider / model / available / reason
    """
    client = get_llm_client()
    available = client.is_available()
    return {
        "provider": getattr(client, "provider", _config.LLM_PROVIDER),
        "model": getattr(client, "model_name", "unknown"),
        "available": available,
        "reason": None if available else getattr(client, "last_error", "不可用"),
    }
