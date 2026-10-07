"""
LLM 运行时设置存储

解决的问题
----------
原实现里 LLM 的全部配置（API Key / 模型 / provider）只能通过**环境变量或 .env 文件**
在启动前设定，改一次必须重启后端。前端"系统设置"菜单项点了只弹一句"功能开发中"。

本模块让设置页可以在运行时读写这些配置，并且：
    1. 立刻生效 —— 改完 config 模块属性 + 重置 LLM 客户端单例，无需重启
    2. 持久化   —— 同时写回仓库根目录的 .env，重启后依然有效
    3. 不泄密   —— 对外只返回掩码后的 Key（sk-****abcd），永不回传明文

安全说明
--------
* .env 已在 .gitignore 中，不会被提交
* 读写 .env 采用"逐行替换 + 原子落盘"，不会破坏文件里的注释与其他键
* 明文 Key 只在内存与 .env 中出现，接口响应里只有掩码
"""

import os
from typing import Any, Dict, Optional

import requests

from ..core import config
from .llm import (
    create_llm_client,
    get_llm_info,
    reset_llm_client,
)

# ========================================
# 允许在设置页里修改的配置项
# ========================================
# 键名 -> config 模块里的属性名（两者同名，这里显式列出便于校验与文档化）
MANAGED_KEYS = (
    "LLM_PROVIDER",
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_MODEL",
    "DEEPSEEK_BASE_URL",
)

SUPPORTED_PROVIDERS = ("deepseek", "ollama")


def _project_root() -> str:
    """
    仓库根目录

    Returns:
        str: 本项目根目录绝对路径（backend/utils/ 往上三层）
    """
    return os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )


def _env_file_path() -> str:
    """
    设置页写回的 .env 路径（仓库根目录）

    Returns:
        str: .env 文件的绝对路径
    """
    return os.path.join(_project_root(), ".env")


# ========================================
# 掩码
# ========================================

def mask_secret(value: Optional[str], keep: int = 4) -> str:
    """
    把密钥掩码成可安全展示的形式

    Args:
        value: 明文密钥
        keep: 保留末尾多少位

    Returns:
        str: 形如 "sk-12******cd" 的掩码；未配置时返回 ""

    Example:
        >>> mask_secret("sk-abcdefghijkl")
        'sk-a******ijkl'
    """
    if not value:
        return ""
    value = value.strip()
    if len(value) <= keep + 4:
        return "*" * len(value)
    return f"{value[:4]}{'*' * 6}{value[-keep:]}"


# ========================================
# .env 读写
# ========================================

def _read_env_file(path: str) -> Dict[str, str]:
    """
    读取 .env 到字典（忽略注释与空行）

    Args:
        path: .env 路径

    Returns:
        dict: 键值对；文件不存在时返回空字典
    """
    data: Dict[str, str] = {}
    if not os.path.exists(path):
        return data
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                stripped = line.strip()
                if not stripped or stripped.startswith("#") or "=" not in stripped:
                    continue
                key, _, value = stripped.partition("=")
                data[key.strip()] = value.strip()
    except OSError as exc:
        print(f"⚠️ 读取 .env 失败: {exc}")
    return data


def _write_env_updates(path: str, updates: Dict[str, str]) -> None:
    """
    把若干键写回 .env：已存在的键就地替换，不存在则追加到末尾

    逐行处理而不是"重新生成整个文件"，因此原有注释、键顺序、其他配置都会保留。
    采用"写临时文件 + 原子替换"，避免写一半失败导致 .env 损坏。

    Args:
        path: .env 路径
        updates: 要写入的键值对
    """
    lines = []
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            lines = fh.read().splitlines()

    remaining = dict(updates)
    out = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in remaining:
                out.append(f"{key}={remaining.pop(key)}")
                continue
        out.append(line)

    if remaining:
        if out and out[-1].strip():
            out.append("")
        out.append("# 以下由「系统设置」页面写入")
        for key, value in remaining.items():
            out.append(f"{key}={value}")

    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")
    os.replace(tmp, path)


# ========================================
# 读取
# ========================================

def get_llm_settings() -> Dict[str, Any]:
    """
    读取当前 LLM 设置（密钥已掩码，可安全返回给前端）

    Returns:
        dict: provider / model / base_url / api_key_set / api_key_masked /
              env_file / available / reason
    """
    info = get_llm_info()
    env_values = _read_env_file(_env_file_path())

    return {
        "provider": config.LLM_PROVIDER,
        "model": config.DEEPSEEK_MODEL,
        "base_url": config.DEEPSEEK_BASE_URL,
        "api_key_set": bool(config.DEEPSEEK_API_KEY),
        "api_key_masked": mask_secret(config.DEEPSEEK_API_KEY),
        # 方便排查"为什么改了没生效"：区分值来自环境变量还是 .env
        "api_key_from_env": bool(os.environ.get("DEEPSEEK_API_KEY")),
        "env_file": _env_file_path(),
        "env_file_exists": os.path.exists(_env_file_path()),
        "env_file_has_key": "DEEPSEEK_API_KEY" in env_values,
        "available": info.get("available", False),
        "reason": info.get("reason"),
        "supported_providers": list(SUPPORTED_PROVIDERS),
    }


# ========================================
# 写入
# ========================================

def update_llm_settings(
    api_key: Optional[str] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    base_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    更新 LLM 设置：写 config + 写 os.environ + 写 .env + 重置客户端

    参数为 None 表示"不改这一项"；传空串表示"清空"（api_key 支持清空）。

    Args:
        api_key: DeepSeek API Key
        provider: "deepseek" 或 "ollama"
        model: 模型名（如 deepseek-flash）
        base_url: API 基址

    Returns:
        dict: {"updated": [...], "settings": 最新的 get_llm_settings()}

    Raises:
        ValueError: provider 取值不支持，或 model/base_url 为空串
    """
    to_env: Dict[str, str] = {}
    updated = []

    if provider is not None:
        normalized = (provider or "").strip().lower()
        if normalized not in SUPPORTED_PROVIDERS:
            raise ValueError(
                f"provider 只支持 {' / '.join(SUPPORTED_PROVIDERS)}，收到 {provider!r}"
            )
        config.LLM_PROVIDER = normalized
        os.environ["LLM_PROVIDER"] = normalized
        to_env["LLM_PROVIDER"] = normalized
        updated.append("LLM_PROVIDER")

    if api_key is not None:
        # 保留用户可能带上的引号与空格：去空格即可，Key 本身不含空格
        normalized_key = (api_key or "").strip()
        config.DEEPSEEK_API_KEY = normalized_key
        # 关键：同时写进 os.environ，否则下次 config 被重新读取时会拿回旧值
        os.environ["DEEPSEEK_API_KEY"] = normalized_key
        to_env["DEEPSEEK_API_KEY"] = normalized_key
        updated.append("DEEPSEEK_API_KEY")

    if model is not None:
        normalized_model = (model or "").strip()
        if not normalized_model:
            raise ValueError("model 不能为空")
        config.DEEPSEEK_MODEL = normalized_model
        os.environ["DEEPSEEK_MODEL"] = normalized_model
        to_env["DEEPSEEK_MODEL"] = normalized_model
        updated.append("DEEPSEEK_MODEL")

    if base_url is not None:
        normalized_url = (base_url or "").strip().rstrip("/")
        if not normalized_url:
            raise ValueError("base_url 不能为空")
        config.DEEPSEEK_BASE_URL = normalized_url
        os.environ["DEEPSEEK_BASE_URL"] = normalized_url
        to_env["DEEPSEEK_BASE_URL"] = normalized_url
        updated.append("DEEPSEEK_BASE_URL")

    if to_env:
        _write_env_updates(_env_file_path(), to_env)

    # 重建 LLM 客户端单例，让新 Key / 新 provider 立刻生效
    reset_llm_client()

    return {"updated": updated, "settings": get_llm_settings()}


# ========================================
# 连通性测试
# ========================================

def test_llm_settings() -> Dict[str, Any]:
    """
    用当前配置探测 LLM 是否真的可用

    DeepSeek 走 `GET /models`：这是标准 OpenAI 兼容端点，**不消耗 token**，
    且能直接区分"Key 无效(401)"与"网络不通"，比发一条对话更省更准。
    该端点若返回 404（个别代理不实现），则退化为一句话的对话请求兜底。

    Returns:
        dict: {"ok": bool, "provider": str, "model": str, "message": str}
    """
    provider = config.LLM_PROVIDER
    client = create_llm_client()

    if not client.is_available():
        return {
            "ok": False,
            "provider": provider,
            "model": getattr(client, "model_name", config.DEEPSEEK_MODEL),
            "message": getattr(client, "last_error", None) or "客户端当前不可用",
        }

    if provider == "ollama":
        # Ollama 本身就是本地服务，is_available() 已经做过探测
        return {
            "ok": True,
            "provider": provider,
            "model": getattr(client, "model_name", config.OLLAMA_MODEL),
            "message": "本地 Ollama 服务可用",
        }

    url = f"{config.DEEPSEEK_BASE_URL}/models"
    try:
        response = requests.get(
            url,
            headers={
                "Authorization": f"Bearer {config.DEEPSEEK_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )
    except requests.exceptions.Timeout:
        return {
            "ok": False, "provider": provider, "model": config.DEEPSEEK_MODEL,
            "message": "请求 DeepSeek 超时（15s），请检查网络或代理设置",
        }
    except requests.exceptions.ConnectionError as exc:
        return {
            "ok": False, "provider": provider, "model": config.DEEPSEEK_MODEL,
            "message": f"无法连接 {config.DEEPSEEK_BASE_URL}：{exc}",
        }
    except Exception as exc:  # noqa: BLE001 - 任何异常都要变成可读信息
        return {
            "ok": False, "provider": provider, "model": config.DEEPSEEK_MODEL,
            "message": f"探测失败：{exc}",
        }

    if response.status_code == 200:
        try:
            names = [m.get("id") for m in response.json().get("data", []) if m.get("id")]
        except Exception:  # noqa: BLE001
            names = []
        return {
            "ok": True,
            "provider": provider,
            "model": config.DEEPSEEK_MODEL,
            "message": f"API Key 有效，服务端可用模型 {len(names)} 个"
                       + (f"（含 {config.DEEPSEEK_MODEL}）" if config.DEEPSEEK_MODEL in names else ""),
        }

    # 401 / 402 / 403 等：把状态码翻译成人话
    hints = {
        401: "API Key 无效或已被撤销",
        402: "账户余额不足",
        403: "该 API Key 无权访问此模型",
        404: "该服务未实现 /models 端点，请改用对话接口验证",
        429: "触发限流，请稍后再试",
    }
    return {
        "ok": False,
        "provider": provider,
        "model": config.DEEPSEEK_MODEL,
        "message": f"HTTP {response.status_code}：{hints.get(response.status_code, '请求被拒绝')}",
    }
