"""
知识图谱管理路由模块
提供图谱统计、样本查询以及节点的增删改接口

原实现有两个路径问题，本版本已修复：
1. 使用了 `from .config import ...`，但配置已迁移到 `backend.core.config`，
   该导入在当前结构中必定失败；
2. 该 router 从未在 main.py 中 include_router，导致 /api/kg/* 全部 404，
   前端 GraphManager 的节点增删改因此完全不可用。
"""

import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .admin.routes import require_admin
from .core import User
from .functions.retrieval import invalidate_entity_cache
from .utils.neo4j_utils import get_neo4j_driver

router = APIRouter(prefix="/api/kg", tags=["KnowledgeGraph"])

# Cypher 不支持参数化标签名，只能拼接；因此标签必须严格白名单 + 正则双重校验，
# 否则存在 Cypher 注入风险。
_LABEL_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")


def safe_label(label: Optional[str], default: str = "Entity") -> str:
    """
    校验并返回可安全拼接进 Cypher 的节点标签

    Args:
        label: 用户提供的标签名
        default: label 为空时使用的默认标签

    Returns:
        str: 合法的标签名

    Raises:
        HTTPException: 标签名不合法时返回 400
    """
    candidate = (label or default).strip()
    if not _LABEL_RE.match(candidate):
        raise HTTPException(
            status_code=400,
            detail="标签只能由字母、数字、下划线组成，且不能以数字开头（最长 64 字符）",
        )
    return candidate


def run_cypher(query: str, **params) -> List[Any]:
    """
    执行一条 Cypher 并返回记录列表

    Args:
        query: Cypher 语句
        **params: Cypher 参数

    Returns:
        list: 查询记录列表

    Raises:
        HTTPException: Neo4j 不可用时返回 503
    """
    try:
        driver = get_neo4j_driver()
    except Exception as exc:  # 连接失败
        raise HTTPException(status_code=503, detail=f"Neo4j 不可用: {exc}") from exc

    try:
        with driver.session() as session:
            return list(session.run(query, **params))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"图谱操作失败: {exc}") from exc


# ========================================
# 请求模型
# ========================================

class NodeCreateRequest(BaseModel):
    """新建节点请求"""

    name: str = Field(..., min_length=1, max_length=200, description="节点名称")
    label: str = Field("Entity", max_length=64, description="节点标签（Cypher Label）")


class NodeUpdateRequest(BaseModel):
    """更新节点请求"""

    name: str = Field(..., min_length=1, max_length=200, description="新的节点名称")
    label: Optional[str] = Field(None, max_length=64, description="可选：同时修改标签")


# ========================================
# 只读接口
# ========================================

@router.get("/stats")
async def get_graph_stats() -> Dict[str, int]:
    """
    获取图谱统计信息

    Returns:
        dict: {"nodes": 节点数, "relationships": 关系数}
    """
    node_rows = run_cypher("MATCH (n) RETURN count(n) AS cnt")
    rel_rows = run_cypher("MATCH ()-[r]->() RETURN count(r) AS cnt")
    return {
        "nodes": node_rows[0]["cnt"] if node_rows else 0,
        "relationships": rel_rows[0]["cnt"] if rel_rows else 0,
    }


@router.get("/sample")
async def get_sample_nodes(limit: int = Query(10, ge=1, le=200)) -> Dict[str, List[dict]]:
    """
    获取样本三元组

    Args:
        limit: 返回条数（1-200）

    Returns:
        dict: {"data": [{"source": {...}, "relation": "...", "target": {...}}, ...]}
    """
    records = run_cypher(
        "MATCH (n)-[r]->(m) RETURN n, r, m LIMIT $limit",
        limit=limit,
    )
    return {
        "data": [
            {
                "source": dict(rec["n"]),
                "relation": rec["r"].type,
                "target": dict(rec["m"]),
            }
            for rec in records
        ]
    }


# ========================================
# 节点增删改（供前端 GraphManager 使用）
# ========================================
# 读取接口保持公开；写操作要求管理员身份
# （Authorization: Bearer <管理员 JWT>，或 X-Admin-Token / ?admin_token= 静态令牌）。

@router.post("/node", status_code=201)
async def create_node(
    payload: NodeCreateRequest,
    _: Optional[User] = Depends(require_admin),
) -> Dict[str, Any]:
    """
    新建一个节点

    Args:
        payload: 节点名称与标签

    Returns:
        dict: {"success": True, "id": elementId, "name": 名称, "label": 标签}
    """
    label = safe_label(payload.label)
    records = run_cypher(
        f"CREATE (n:`{label}` {{name: $name}}) "
        "RETURN elementId(n) AS id, n.name AS name, labels(n) AS labels",
        name=payload.name,
    )
    if not records:
        raise HTTPException(status_code=500, detail="节点创建失败")

    rec = records[0]
    # 节点名集合变了，让问答/推理用的实体名缓存立即失效
    invalidate_entity_cache()
    return {
        "success": True,
        "id": rec["id"],
        "name": rec["name"],
        "label": (rec["labels"] or [label])[0],
    }


@router.put("/node/{node_id}")
async def update_node(
    node_id: str,
    payload: NodeUpdateRequest,
    _: Optional[User] = Depends(require_admin),
) -> Dict[str, Any]:
    """
    更新节点名称（可选同时修改标签）

    Args:
        node_id: Neo4j elementId
        payload: 新名称与可选新标签

    Returns:
        dict: {"success": True, "id": ..., "name": ...}
    """
    # 先确认节点存在，避免"更新成功但什么也没发生"的假成功
    exists = run_cypher(
        "MATCH (n) WHERE elementId(n) = $id RETURN elementId(n) AS id",
        id=node_id,
    )
    if not exists:
        raise HTTPException(status_code=404, detail="节点不存在")

    # 追加标签（保留原有标签，避免丢失已有分类信息）
    if payload.label:
        new_label = safe_label(payload.label)
        run_cypher(
            "MATCH (n) WHERE elementId(n) = $id "
            f"SET n:`{new_label}`",
            id=node_id,
        )

    records = run_cypher(
        "MATCH (n) WHERE elementId(n) = $id "
        "SET n.name = $name "
        "RETURN elementId(n) AS id, n.name AS name",
        id=node_id,
        name=payload.name,
    )

    rec = records[0] if records else {}
    invalidate_entity_cache()
    return {"success": True, "id": node_id, "name": rec.get("name", payload.name)}


@router.delete("/node/{node_id}")
async def delete_node(
    node_id: str,
    _: Optional[User] = Depends(require_admin),
) -> Dict[str, Any]:
    """
    删除节点及其所有关联关系

    Args:
        node_id: Neo4j elementId

    Returns:
        dict: {"success": True, "deleted": 删除的节点数}
    """
    records = run_cypher(
        "MATCH (n) WHERE elementId(n) = $id "
        "DETACH DELETE n "
        "RETURN count(n) AS deleted",
        id=node_id,
    )
    invalidate_entity_cache()
    return {"success": True, "deleted": records[0]["deleted"] if records else 0}
