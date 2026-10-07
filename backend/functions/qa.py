"""
问答模块
使用LLM和Neo4j知识图谱实现智能问答功能
"""

from .agent import answer_question_with_graph as agent_answer_question_with_graph


def answer_question_with_graph(question: str) -> dict:
    """
    使用知识图谱进行问答
    结合Neo4j知识图谱和LLM模型进行智能问答
    
    Args:
        question: 用户提问的问题
        
    Returns:
        dict: 包含answer（答案）和used_triples（使用的三元组）的字典
        
    Example:
        >>> result = answer_question_with_graph("什么是恶意代码？")
        >>> print(result['answer'])
        >>> print(result['used_triples'])
    """
    try:
        result = agent_answer_question_with_graph(question)
        return result
    except Exception as e:
        return {
            "answer": f"问答失败：{str(e)}",
            "used_triples": []
        }
