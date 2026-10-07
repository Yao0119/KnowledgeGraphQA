"""
AI代理模块
集成 Neo4j 知识图谱与 LLM（DeepSeek 云端 API 或本地 Ollama）的问答代理

修复记录
--------
原实现的检索只取问题的第一个空白分词做子串匹配，中文问句必然 0 命中
（详见 backend/functions/retrieval.py 的文件头说明）。现在改为调用
retrieval.retrieve_for_question() 的两阶段检索（实体字面命中 → 关键词兜底）。
"""

from typing import Any, Dict, List

from ..utils.llm import get_llm_client
from .retrieval import (
    build_evidence,
    extract_terms,
    match_entity_names,
    retrieve_for_question,
)


# ========================================
# 兼容旧接口
# ========================================

def extract_keyword(question: str) -> str:
    """
    从问题中提取一个关键词（保留此函数仅为兼容旧调用）

    建议改用 retrieval.extract_terms()，它会返回一组候选词。

    Args:
        question: 用户提问

    Returns:
        str: 优先级最高的一个候选词（无候选时返回原问题）
    """
    terms = extract_terms(question, max_terms=1)
    return terms[0] if terms else question


def query_neo4j_for_question(question: str) -> List[str]:
    """
    按问题检索相关三元组（保留此函数仅为兼容旧调用）

    Args:
        question: 用户问题

    Returns:
        list: 证据文本行列表
    """
    result = retrieve_for_question(question)
    return [
        f"({t['source']} -[{t['relation']}]-> {t['target']})"
        for t in result["triples"]
    ]


# ========================================
# LLM 问答核心逻辑
# ========================================

def build_prompt(question: str, retrieval: Dict[str, Any]) -> str:
    """
    构造问答提示词

    Args:
        question: 用户问题
        retrieval: retrieve_for_question() 的返回值

    Returns:
        str: 完整提示词
    """
    evidence = retrieval.get("evidence") or ""
    entities = retrieval.get("entities") or []

    if evidence:
        facts_block = evidence
        hint = ""
        if entities:
            hint = f"\n（其中与问题直接相关的图谱实体：{'、'.join(entities)}）\n"
    else:
        facts_block = "（知识图谱中未检索到与问题相关的事实）"
        hint = ""

    return f"""你是一个智能知识图谱问答助手。
请基于以下知识图谱内容，回答用户的问题。

【已知事实】
{facts_block}{hint}
【用户问题】
{question}

【回答要求】
1. 优先依据上面的知识图谱事实回答，不要编造图谱中不存在的关系；
2. 如果事实不足以回答，先明确说明"知识图谱中缺少相关信息"，再补充通用常识，
   并标明哪部分属于常识而非图谱事实；
3. 回答应简洁、准确、有逻辑。

直接给出答案，不需要重复问题。"""


def answer_question_with_graph(question: str) -> Dict[str, Any]:
    """
    融合 Neo4j 知识图谱 + LLM 生成回答

    Args:
        question: 用户问题

    Returns:
        dict: {
            "answer": str,                 回答文本
            "used_triples": list[dict],    使用到的三元组（结构化）
            "sources": list[dict],         同 used_triples
            "retrieval": dict,             检索策略与命中信息
            "llm": dict,                   实际使用的 LLM 后端
        }
    """
    if not question or not isinstance(question, str):
        return {
            "answer": "问题无效，请输入自然语言问题。",
            "used_triples": [],
            "sources": [],
            "retrieval": {"strategy": "invalid", "entities": [], "terms": []},
            "llm": {},
        }

    # Step 1: 两阶段检索图谱证据
    retrieval = retrieve_for_question(question)
    triples = retrieval["triples"]

    # Step 2: 构造提示词
    prompt = build_prompt(question, retrieval)

    # Step 3: 调用 LLM（DeepSeek 或 Ollama，由 LLM_PROVIDER 决定）
    client = get_llm_client()
    try:
        response = client.chat(messages=[{"role": "user", "content": prompt}])
        answer = response.get("message", {}).get("content", "").strip()
        if not answer:
            answer = "抱歉，未能生成回答。"
    except Exception as exc:  # 兜底，正常路径下客户端自己会返回可读错误
        print(f"⚠️ LLM 调用异常: {exc}")
        answer = f"抱歉，当前问答服务暂时不可用：{exc}"

    return {
        "answer": answer,
        "used_triples": triples,
        "sources": triples,
        "retrieval": {
            "strategy": retrieval["strategy"],
            "entities": retrieval["entities"],
            "terms": retrieval["terms"],
        },
        "llm": {
            "provider": getattr(client, "provider", None),
            "model": getattr(client, "model_name", None),
        },
    }


def call_llm(prompt: str) -> str:
    """
    调用 LLM 生成回答

    Args:
        prompt: 提示词

    Returns:
        str: LLM 生成的响应（失败时返回可读的错误说明）
    """
    client = get_llm_client()
    response = client.chat(messages=[{"role": "user", "content": prompt}])
    return response.get("message", {}).get("content", "无法生成回答")


# 保留旧名字，避免外部调用方失效
call_local_llm = call_llm
