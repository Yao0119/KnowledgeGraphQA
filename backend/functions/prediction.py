"""
预测模块
基于机器学习模型进行威胁预测
"""

from typing import Optional, Dict, Any
from ..utils.llm import get_llm_client


def predict_threat(
    data: Dict[str, Any],
    threat_type: Optional[str] = None
) -> Dict[str, Any]:
    """
    进行威胁预测
    基于提供的数据特征进行威胁类型预测
    
    Args:
        data: 要预测的数据特征字典
        threat_type: 可选的威胁类型提示
        
    Returns:
        dict: 包含以下键的字典：
            - prediction: 预测的威胁类型
            - confidence: 预测的置信度 (0-1)
            - details: 详细的分析结果
            
    Example:
        >>> data = {
        ...     "file_size": 1024,
        ...     "file_type": "exe",
        ...     "origin": "unknown"
        ... }
        >>> result = predict_threat(data)
        >>> print(result['prediction'])
    """
    llm_client = get_llm_client()
    
    if not llm_client.is_available():
        reason = getattr(llm_client, "last_error", None) or "LLM 后端不可用"
        return {
            "prediction": "无法预测",
            "confidence": 0.0,
            "details": {"error": reason}
        }
    
    # 构建预测提示词
    system_prompt = (
        "你是一名安全威胁分析专家，专门进行恶意软件和网络威胁的预测。\n"
        "基于提供的特征数据，你应该分析其威胁级别，并给出预测。\n"
        "回答格式：威胁类型 | 置信度(0-1) | 简要分析"
    )
    
    data_str = "\n".join([f"{k}: {v}" for k, v in data.items()])
    user_prompt = (
        f"请基于以下特征数据进行威胁预测：\n{data_str}\n\n"
        f"威胁类型提示：{threat_type if threat_type else '无'}"
    )
    
    try:
        response = llm_client.chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )
        
        result_text = response.get("message", {}).get("content", "")
        
        # 解析响应
        parts = result_text.split("|")
        if len(parts) >= 3:
            prediction = parts[0].strip()
            try:
                confidence = float(parts[1].strip())
            except ValueError:
                confidence = 0.5
            details = {"analysis": parts[2].strip()}
        else:
            prediction = "未知威胁"
            confidence = 0.5
            details = {"analysis": result_text}
        
        return {
            "prediction": prediction,
            "confidence": min(1.0, max(0.0, confidence)),
            "details": details
        }
    except Exception as e:
        return {
            "prediction": "预测失败",
            "confidence": 0.0,
            "details": {"error": str(e)}
        }
