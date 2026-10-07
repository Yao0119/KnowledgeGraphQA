"""
functions 模块初始化文件
导出函数模块相关的路由和功能类
"""

from .routes import router as functions_router
from .qa import answer_question_with_graph
from .reasoning import ReasoningModule
from .prediction import predict_threat
from .agent import answer_question_with_graph as agent_answer_question
from .retrieval import (
    extract_terms,
    match_entity_names,
    retrieve_for_question,
    invalidate_entity_cache,
    get_node_names,
    build_evidence,
)

# 导出
__all__ = [
    "functions_router",
    "answer_question_with_graph",
    "agent_answer_question",
    "ReasoningModule",
    "predict_threat",
    # 知识图谱检索
    "extract_terms",
    "match_entity_names",
    "retrieve_for_question",
    "invalidate_entity_cache",
    "get_node_names",
    "build_evidence",
]
