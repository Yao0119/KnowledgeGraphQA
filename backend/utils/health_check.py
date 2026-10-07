"""
健康检查模块
提供系统各组件的健康状态检查功能
"""

import requests
from neo4j import GraphDatabase
from typing import Dict, Any
from ..core.config import (
    DEEPSEEK_API_KEY,
    DEEPSEEK_MODEL,
    LLM_PROVIDER,
    NEO4J_URI,
    NEO4J_USER,
    NEO4J_PASSWORD,
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
)
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading


# ========================================
# 健康检查函数
# ========================================

def check_neo4j_connection() -> bool:
    """
    检查Neo4j数据库连接
    
    Returns:
        bool: 连接成功返回True，否则返回False
    """
    try:
        from .neo4j_utils import get_neo4j_driver
        driver = get_neo4j_driver()
        with driver.session() as session:
            session.run("RETURN 1")
        return True
    except Exception as e:
        print(f"Neo4j 连接失败: {e}")
        return False


def check_ollama_connection() -> bool:
    """
    检查Ollama LLM服务连接
    
    Returns:
        bool: 连接成功返回True，否则返回False
    """
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
        return response.status_code == 200
    except Exception as e:
        print(f"Ollama 连接失败: {e}")
        return False


def llm_provider_info() -> Dict[str, Any]:
    """
    获取当前 LLM 后端的配置与可用性

    Returns:
        dict: {"provider": str, "model": str, "available": bool, "reason": str|None}
    """
    provider = (LLM_PROVIDER or "deepseek").strip().lower()
    if provider == "deepseek":
        available = bool(DEEPSEEK_API_KEY)
        return {
            "provider": "deepseek",
            "model": DEEPSEEK_MODEL,
            "available": available,
            "reason": None if available else "未配置 DEEPSEEK_API_KEY",
        }
    if provider == "ollama":
        available = check_ollama_connection()
        return {
            "provider": "ollama",
            "model": OLLAMA_MODEL,
            "available": available,
            "reason": None if available else f"无法连接 {OLLAMA_BASE_URL}",
        }
    return {
        "provider": provider,
        "model": None,
        "available": False,
        "reason": f"不支持的 LLM_PROVIDER: {provider}",
    }


def check_llm_connection() -> bool:
    """
    检查当前配置的 LLM 后端是否可用

    根据 LLM_PROVIDER 分派到 DeepSeek（判断是否已配置 API Key）
    或 Ollama（探测本地服务）。

    Returns:
        bool: 可用返回True
    """
    return bool(llm_provider_info()["available"])


def check_mysql_connection() -> bool:
    """
    检查MySQL数据库连接
    
    Returns:
        bool: 连接成功返回True，否则返回False
    """
    try:
        from ..core.models import engine
        from sqlalchemy import text
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            result.fetchone()
        return True
    except Exception as e:
        print(f"MySQL 连接失败: {e}")
        return False


# ========================================
# 综合健康检查
# ========================================

def get_system_health() -> Dict[str, Any]:
    """
    获取整个系统的健康状态
    检查所有外部服务的连接状态（使用并发执行以加快速度）

    Returns:
        dict: 包含各个服务状态的字典。其中 `llm` 为当前配置的 LLM 后端状态，
              `ollama` 为兼容旧前端保留的同义字段（语义等同"LLM 后端是否可用"）。

    Example:
        >>> health = get_system_health()
        >>> print(health['overall'])  # "healthy", "degraded", "unhealthy"
    """
    results: Dict[str, bool] = {}

    # 使用线程池并发检查各服务
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            executor.submit(check_neo4j_connection): "neo4j",
            executor.submit(check_llm_connection): "llm",
            executor.submit(check_mysql_connection): "mysql",
        }

        # 注意：原实现把 as_completed(timeout=6) 放在 try 之外，
        # 任一服务卡住导致整体超时时会抛出未捕获的 TimeoutError，让 /api/health 直接 500。
        try:
            for future in as_completed(futures, timeout=8):
                service = futures[future]
                try:
                    results[service] = bool(future.result(timeout=1))
                except Exception as e:
                    print(f"{service} 检查超时或出错: {e}")
                    results[service] = False
        except Exception as e:
            print(f"健康检查整体超时: {e}")

    # 未在超时前返回的服务按不可用处理
    neo4j_ok = results.get("neo4j", False)
    llm_ok = results.get("llm", False)
    mysql_ok = results.get("mysql", False)

    # 确定整体状态
    if neo4j_ok and llm_ok and mysql_ok:
        overall = "healthy"
    elif neo4j_ok or llm_ok or mysql_ok:
        overall = "degraded"
    else:
        overall = "unhealthy"

    info = llm_provider_info()

    return {
        "backend": True,
        "neo4j": "connected" if neo4j_ok else "disconnected",
        "llm": "connected" if llm_ok else "disconnected",
        "llm_provider": info["provider"],
        "llm_model": info["model"],
        "llm_reason": info["reason"],
        # 兼容字段：旧前端读取的是 stats.ollama，语义等同于"LLM 后端是否可用"
        "ollama": "connected" if llm_ok else "disconnected",
        "mysql": "connected" if mysql_ok else "disconnected",
        "overall": overall,
    }


def get_neo4j_stats() -> Dict[str, int]:
    """
    获取Neo4j图谱统计信息
    
    Returns:
        dict: 包含节点数和关系数的字典
    """
    try:
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        with driver.session() as session:
            node_count = session.run("MATCH (n) RETURN count(n) AS c").single()["c"]
            rel_count = session.run("MATCH ()-[r]->() RETURN count(r) AS c").single()["c"]
        driver.close()
        return {"nodes": node_count, "relationships": rel_count}
    except Exception as e:
        print(f"获取Neo4j统计信息失败: {e}")
        return {"nodes": 0, "relationships": 0}


def get_ollama_models() -> Dict[str, Any]:
    """
    获取可用的Ollama模型列表
    
    Returns:
        dict: 包含可用模型的字典
    """
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        if response.status_code == 200:
            data = response.json()
            models = [m.get("name", "unknown") for m in data.get("models", [])]
            return {"available": True, "models": models}
        else:
            return {"available": False, "models": []}
    except Exception as e:
        print(f"获取Ollama模型列表失败: {e}")
        return {"available": False, "models": []}
