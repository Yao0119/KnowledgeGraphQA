"""
函数路由模块
处理所有AI功能相关的API端点（问答、推理、预测等）
"""

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from ..core import get_db, User
from ..customer.routes import get_current_customer
from .qa import answer_question_with_graph
from .reasoning import ReasoningModule
from .prediction import predict_threat
from ..utils.neo4j_utils import get_neo4j_driver
from ..core.config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# ========================================
# 路由初始化
# ========================================
router = APIRouter(tags=["Functions"])


# ========================================
# Pydantic 请求/响应模型
# ========================================

class QuestionRequest(BaseModel):
    """
    问答请求模型
    用户提交问题进行知识图谱检索
    """
    question: str


class ReasoningRequest(BaseModel):
    """
    推理请求模型
    用户提交问题进行LLM推理
    """
    question: str
    context: Optional[str] = None


class PredictionRequest(BaseModel):
    """
    预测请求模型
    用户提交数据进行威胁预测
    """
    data: dict
    threat_type: Optional[str] = None


class ResponseBase(BaseModel):
    """
    响应基础模型
    所有响应都包含success和message字段
    """
    success: bool = True
    message: Optional[str] = None


class QAResponse(ResponseBase):
    """
    问答响应模型
    包含问题、答案、来源三元组与检索信息
    """
    question: str
    answer: str
    sources: List[dict] = []
    retrieval: Optional[dict] = None


class ReasoningResponse(ResponseBase):
    """
    推理响应模型
    包含推理答案、证据和使用的节点
    """
    answer: str
    evidence: str
    used_nodes: List[str] = []


class PredictionResponse(ResponseBase):
    """
    预测响应模型
    包含预测结果和置信度
    """
    prediction: str
    confidence: float
    details: Optional[dict] = None


class VirusDetectionRequest(BaseModel):
    """
    病毒检测请求模型
    """
    file_name: Optional[str] = "unknown_file"
    file_type: Optional[str] = "exe"
    sample_content: Optional[str] = ""


class VirusDetectionResponse(ResponseBase):
    """
    病毒检测响应模型
    """
    is_malicious: bool
    threat_level: str
    scan_results: List[dict]
    summary: str


# ========================================
# 工具函数
# ========================================

def get_reasoning_module() -> ReasoningModule:
    """
    获取推理模块实例
    
    Returns:
        ReasoningModule: 初始化的推理模块
    """
    return ReasoningModule(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)


# ========================================
# API 端点 - 问答功能
# ========================================

@router.post("/api/qa/ask", response_model=QAResponse)
async def ask_question(
    payload: QuestionRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    问答检索接口
    使用本地LLM和Neo4j知识图谱回答用户问题
    
    Args:
        payload: 包含问题的请求体
        authorization: 可选的授权令牌
        db: 数据库会话
        
    Returns:
        QAResponse: 包含答案和源信息的响应
    """
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="问题不能为空")
    
    try:
        # 调用QA模块获取答案
        result = answer_question_with_graph(question)
        
        # 处理返回结果
        if isinstance(result, dict):
            answer = result.get("answer", "暂无回答")
            # sources 现在是结构化的三元组（{source, relation, target}），
            # 与 QAResponse.sources: List[dict] 的声明一致。
            # 原实现把字符串三元组塞进 List[dict]，一旦真的检索到数据就会校验失败。
            sources = result.get("sources") or result.get("used_triples") or []
            retrieval = result.get("retrieval") or {}
        else:
            answer = str(result) if result else "暂无回答"
            sources = []
            retrieval = {}
        
        return QAResponse(
            question=question,
            answer=answer,
            sources=sources,
            retrieval=retrieval or None,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"问答失败：{str(e)}"
        )


# ========================================
# API 端点 - 推理功能
# ========================================

@router.post("/api/reasoning/reason", response_model=ReasoningResponse)
async def reason_with_knowledge(
    payload: ReasoningRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    知识推理接口
    使用LLM结合Neo4j知识图谱进行逻辑推理
    
    Args:
        payload: 包含问题和可选上下文的请求体
        authorization: 可选的授权令牌
        db: 数据库会话
        
    Returns:
        ReasoningResponse: 包含推理答案和证据的响应
    """
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="问题不能为空")
    
    try:
        # 初始化推理模块
        reasoning_module = get_reasoning_module()
        
        # 执行推理
        result = reasoning_module.reason_with_graph(question)
        
        return ReasoningResponse(
            answer=result.get("answer", "推理失败"),
            evidence=result.get("evidence", ""),
            used_nodes=result.get("used_nodes", [])
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"推理失败：{str(e)}"
        )


# ========================================
# API 端点 - 预测功能
# ========================================

@router.post("/api/prediction/predict", response_model=PredictionResponse)
async def predict_threat_endpoint(
    payload: PredictionRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    威胁预测接口
    基于用户提交的数据进行威胁预测
    
    Args:
        payload: 包含预测数据的请求体
        authorization: 可选的授权令牌
        db: 数据库会话
        
    Returns:
        PredictionResponse: 包含预测结果和置信度的响应
    """
    if not payload.data:
        raise HTTPException(status_code=400, detail="预测数据不能为空")
    
    try:
        # 执行预测
        result = predict_threat(payload.data, payload.threat_type)
        
        return PredictionResponse(
            prediction=result.get("prediction", "无法预测"),
            confidence=result.get("confidence", 0.0),
            details=result.get("details", {})
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"预测失败：{str(e)}"
        )


# ========================================
# 健康检查端点
# ========================================

@router.get("/api/functions/health")
async def check_functions_health():
    """
    检查函数模块的健康状态
    包括 LLM 后端（DeepSeek / Ollama）与 Neo4j 的连接状态

    Returns:
        dict: 包含各个服务的健康状态
    """
    from ..utils.health_check import (
        check_neo4j_connection,
        check_llm_connection,
        llm_provider_info,
    )

    neo4j_status = check_neo4j_connection()
    llm_info = llm_provider_info()
    llm_status = check_llm_connection()

    return {
        "neo4j": neo4j_status,
        "llm": llm_status,
        "llm_provider": llm_info["provider"],
        "llm_model": llm_info["model"],
        "llm_reason": llm_info["reason"],
        # 兼容字段
        "ollama": llm_status if llm_info["provider"] == "ollama" else False,
        "overall": "healthy" if neo4j_status and llm_status else "degraded"
    }


# ========================================
# API 端点 - 病毒检测功能
# ========================================

@router.post("/api/virus-detection", response_model=VirusDetectionResponse)
async def detect_virus(
    payload: VirusDetectionRequest,
    authorization: Optional[str] = Header(None)
):
    """
    病毒检测接口
    """
    import random
    import time
    
    # 模拟检测过程
    time.sleep(1.5)
    
    # 简单的模拟逻辑
    is_malicious = random.random() > 0.7
    threat_level = "High" if is_malicious else "Low"
    
    if is_malicious:
        scan_results = [
            {"engine": "静态分析", "result": "检测到可疑的 API 调用", "status": "恶意"},
            {"engine": "行为沙箱", "result": "未授权的文件加密尝试", "status": "恶意"},
            {"engine": "特征码库", "result": "匹配 Trojan.Generic.123", "status": "恶意"}
        ]
        summary = f"警告：检测到病毒！文件 {payload.file_name} 具有高度威胁性。"
    else:
        scan_results = [
            {"engine": "静态分析", "result": "结构正常", "status": "安全"},
            {"engine": "行为沙箱", "result": "未发现可疑活动", "status": "安全"},
            {"engine": "特征码库", "result": "未匹配到已知病毒", "status": "安全"}
        ]
        summary = f"文件 {payload.file_name} 扫描完成，未发现明显威胁。"

    return VirusDetectionResponse(
        success=True,
        message="检测完成",
        is_malicious=is_malicious,
        threat_level=threat_level,
        scan_results=scan_results,
        summary=summary
    )
