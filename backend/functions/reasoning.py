"""
推理模块
使用LLM结合Neo4j知识图谱进行逻辑推理

修复记录：原先 `_get_related_knowledge` 直接把**整个问题字符串**当成关键词
做 `CONTAINS` 匹配（中文问句没有空格，等于整句匹配），必然 0 命中。
现在复用 retrieval.retrieve_for_question() 的两阶段检索。
"""

from ..utils.llm import get_llm_client
from .retrieval import retrieve_for_question


class ReasoningModule:
    """
    LLM + Neo4j 推理模块
    使用 LLM（DeepSeek / Ollama）与知识图谱进行智能推理

    Attributes:
        llm_client: LLM 客户端（DeepSeek 或 Ollama）
    """

    def __init__(self, neo4j_uri: str = None, neo4j_user: str = None, neo4j_password: str = None):
        """
        初始化推理模块

        注意：不再自建 Neo4j 驱动。原实现每处理一次推理请求就
        `GraphDatabase.driver(...)` 新建一个驱动且从不关闭（连接泄漏）；
        现在统一复用 utils.neo4j_utils 中的全局驱动。
        参数仅为兼容旧调用签名而保留。

        Args:
            neo4j_uri: 已忽略（保留以兼容旧签名）
            neo4j_user: 已忽略
            neo4j_password: 已忽略
        """
        self.llm_client = get_llm_client()

        provider = getattr(self.llm_client, "provider", "unknown")
        model = getattr(self.llm_client, "model_name", "unknown")

        if self.llm_client.is_available():
            print(f"✅ ReasoningModule 初始化成功，LLM 已就绪 (provider={provider}, model={model})。")
        else:
            print(f"⚠️ Warning: LLM 不可用 (provider={provider})，"
                  f"原因: {getattr(self.llm_client, 'last_error', None) or '未知'}")

    # ========================================
    # 知识图谱查询
    # ========================================

    def _get_related_knowledge(self, question: str, limit: int = 30) -> tuple:
        """
        从 Neo4j 检索与问题相关的知识

        Args:
            question: 用户问题
            limit: 返回结果的最大数量

        Returns:
            tuple: (证据文本, 节点ID列表)
        """
        result = retrieve_for_question(question, limit=limit)

        if result["strategy"] == "no-match":
            return "未检索到与问题相关的图谱知识。", []

        return result["evidence"], result["used_nodes"]

    # ========================================
    # 推理引擎
    # ========================================

    def reason_with_graph(self, question: str) -> dict:
        """
        使用LLM进行推理
        结合知识图谱证据进行逻辑推理
        
        Args:
            question: 用户问题
            
        Returns:
            dict: 包含以下键的字典：
                - answer: 推理得出的答案
                - evidence: 使用的证据文本
                - used_nodes: 使用的节点ID列表
        """
        # Step 1: 从图中提取相关知识
        evidence_text, node_ids = self._get_related_knowledge(question)

        # Step 2: 定义推理提示词
        system_prompt = (
            "你是一名知识推理专家，专门使用提供的证据进行逻辑推理。\n\n"
            "规则要求：\n"
            "1. 你必须严格依据提供的知识证据回答问题，不能引用外部资料。\n"
            "2. 如果证据不足，请回答：'无法从知识库中推理出结论'。\n"
            "3. 回答应保持客观中立。\n"
            "4. 回答应简洁、专业。"
        )

        user_prompt = (
            f"问题：{question}\n\n"
            f"知识证据：\n{evidence_text}\n\n"
            f"请基于上述证据进行推理并回答。"
        )

        # Step 3: 调用 LLM（客户端自身会在不可用时返回可读的原因）
        try:
            response = self.llm_client.chat(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ]
            )
            answer = response.get("message", {}).get("content") or "推理失败"
        except Exception as e:
            answer = f"推理过程中出错：{str(e)}"

        return {
            "answer": answer,
            "evidence": evidence_text,
            "used_nodes": node_ids
        }

    def close(self):
        """
        释放资源

        驱动由 utils.neo4j_utils 全局管理（应用关闭时统一 close_driver()），
        本模块不再持有自己的连接，因此这里无需操作。
        """
        return None
