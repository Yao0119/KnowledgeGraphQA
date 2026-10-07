"""
utils 模块初始化文件
导出实用工具函数和类
"""

from .neo4j_utils import (
    get_neo4j_driver,
    get_graph_summary,
    get_sample_triples,
    get_full_graph,
    list_dual_malware,
    get_layer_graph,
    get_dual_layer_graph,
    get_node_detail,
    query_node_by_name,
    query_relationships,
    node_display_name,
    node_display_type,
    node_payload,
    close_driver
)

from .local_llm import (
    LocalLLMClient,
    OllamaClient,
)

from .deepseek_llm import DeepSeekClient

from .llm import (
    AnyLLMClient,
    create_llm_client,
    get_llm_client,
    get_llm_info,
    reset_llm_client,
)

from .settings_store import (
    get_llm_settings,
    update_llm_settings,
    test_llm_settings,
    mask_secret,
)

from .health_check import (
    check_neo4j_connection,
    check_ollama_connection,
    check_llm_connection,
    check_mysql_connection,
    get_system_health,
    get_neo4j_stats,
    get_ollama_models,
)

# 导出
__all__ = [
    # Neo4j 工具
    "get_neo4j_driver",
    "get_graph_summary",
    "get_sample_triples",
    "get_full_graph",
    "list_dual_malware",
    "get_layer_graph",
    "get_dual_layer_graph",
    "get_node_detail",
    "query_node_by_name",
    "query_relationships",
    "node_display_name",
    "node_display_type",
    "node_payload",
    "close_driver",
    
    # LLM 工具
    "LocalLLMClient",
    "OllamaClient",
    "DeepSeekClient",
    "AnyLLMClient",
    "create_llm_client",
    "get_llm_client",
    "get_llm_info",
    "reset_llm_client",

    # LLM 运行时设置（设置页读写 API Key 等）
    "get_llm_settings",
    "update_llm_settings",
    "test_llm_settings",
    "mask_secret",
    
    # 健康检查
    "check_neo4j_connection",
    "check_ollama_connection",
    "check_llm_connection",
    "check_mysql_connection",
    "get_system_health",
    "get_neo4j_stats",
    "get_ollama_models",
]
