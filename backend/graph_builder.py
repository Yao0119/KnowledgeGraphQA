"""结构化 TXT/Markdown 建图任务。

第一版故意采用确定性的轻量解析器，不依赖 LLM：用户按“实体 / 类型 / 关系”
格式提供文本后，后台任务负责解析、写入 Neo4j，并更新 MySQL 任务进度。
"""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Tuple

from .core.models import (
    GraphBuildJob,
    GraphBuildStatus,
    GraphStatus,
    KnowledgeGraph,
    SessionLocal,
)
from .functions.retrieval import invalidate_entity_cache
from .utils.neo4j_utils import get_graph_summary, get_neo4j_driver


_ENTITY_RE = re.compile(r"^(?:实体|entity)\s*[:：]\s*(.+)$", re.IGNORECASE)
_TYPE_RE = re.compile(r"^(?:类型|type)\s*[:：]\s*(.+)$", re.IGNORECASE)
_RELATION_RE = re.compile(r"^(?:关系|relation)\s*[:：]\s*(.+)$", re.IGNORECASE)
_ARROW_RE = re.compile(r"^(.*?)\s*[-—]\s*(.*?)\s*(?:->|→)\s*(.+?)$")
_SHORT_ARROW_RE = re.compile(r"^(.*?)\s*(?:->|→)\s*(.+?)$")


def _clean(value: str, max_length: int = 240) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())[:max_length]


def _node_type(value: str) -> str:
    """保留用户可读类型；类型作为属性写入，避免动态 Cypher 标签注入。"""
    return _clean(value, 64) or "Entity"


def _norm_name(value: str) -> str:
    return re.sub(r"\s+", " ", _clean(value, 240)).casefold()


def parse_structured_text(text: str) -> Tuple[List[Dict[str, str]], List[Dict[str, str]]]:
    """解析推荐格式：

    实体：Example Trojan
    类型：Malware

    关系：Example Trojan - 运行环境 -> Windows

    也接受在实体块内写“关系：运行环境 -> Windows”。
    """
    nodes: Dict[str, Dict[str, str]] = {}
    relationships: Dict[Tuple[str, str, str], Dict[str, str]] = {}
    current_entity = ""
    in_code_block = False

    def ensure_node(name: str, node_type: str = "Entity") -> str:
        clean_name = _clean(name)
        if not clean_name:
            return ""
        existing = nodes.setdefault(
            clean_name,
            {"name": clean_name, "node_type": _node_type(node_type)},
        )
        if node_type and existing.get("node_type") in (None, "Entity"):
            existing["node_type"] = _node_type(node_type)
        return clean_name

    def add_relationship(source: str, relation: str, target: str) -> None:
        source_name = ensure_node(source)
        target_name = ensure_node(target)
        relation_name = _clean(relation, 120)
        if not source_name or not target_name or not relation_name:
            return
        key = (source_name, relation_name, target_name)
        relationships[key] = {
            "source": source_name,
            "relation": relation_name,
            "target": target_name,
        }

    for raw_line in text.splitlines():
        raw = raw_line.strip()
        if raw.startswith("```"):
            in_code_block = not in_code_block
            continue
        # 保留 text 代码块中的“实体：/关系：”示例，因为用户经常会把
        # 推荐格式直接粘贴到 Markdown 代码块里；只过滤明显的 Cypher 行。
        # 例如 MATCH (a)-[r]->(b) 不能被宽松箭头规则识别成三个实体。
        if in_code_block and re.match(
            r"^(MATCH|OPTIONAL MATCH|RETURN|CREATE|MERGE|WHERE|WITH)\b",
            raw,
            re.IGNORECASE,
        ):
            continue

        line = raw.lstrip("-•* ").strip()
        if not line or line.startswith("#"):
            continue

        entity_match = _ENTITY_RE.match(line)
        if entity_match:
            current_entity = ensure_node(entity_match.group(1))
            continue

        type_match = _TYPE_RE.match(line)
        if type_match and current_entity:
            nodes[current_entity]["node_type"] = _node_type(type_match.group(1))
            continue

        relation_line = _RELATION_RE.match(line)
        if relation_line:
            relation_body = relation_line.group(1)
            arrow_match = _ARROW_RE.match(relation_body)
            if arrow_match:
                add_relationship(
                    arrow_match.group(1), arrow_match.group(2), arrow_match.group(3)
                )
                continue

            short_match = _SHORT_ARROW_RE.match(relation_body)
            if short_match and current_entity:
                add_relationship(current_entity, short_match.group(1), short_match.group(2))
                continue

        # 允许不写“关系：”前缀的简洁写法：A - 关系 -> B
        arrow_match = _ARROW_RE.match(line)
        if arrow_match and not _looks_like_cypher_arrow(line, arrow_match):
            add_relationship(
                arrow_match.group(1), arrow_match.group(2), arrow_match.group(3)
            )

    return list(nodes.values()), list(relationships.values())


def _looks_like_cypher_arrow(line: str, match: re.Match) -> bool:
    """过滤 Markdown 中常见的 Cypher/代码示例箭头。"""
    source = match.group(1).strip()
    relation = match.group(2).strip()
    target = match.group(3).strip()
    if source.startswith("(") or target.startswith("("):
        return True
    if relation.startswith("[") and relation.endswith("]"):
        return True
    if re.match(r"^(MATCH|OPTIONAL MATCH|RETURN|CREATE|MERGE|WHERE|WITH)\b", line, re.IGNORECASE):
        return True
    return False


def _chunks(items: List[dict], size: int = 500):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def _update_job(job_id: int, **values) -> None:
    db = SessionLocal()
    try:
        job = db.query(GraphBuildJob).filter(GraphBuildJob.id == job_id).first()
        if job:
            for key, value in values.items():
                setattr(job, key, value)
            db.commit()
    finally:
        db.close()


def _write_to_neo4j(graph_id: str, nodes: List[dict], relationships: List[dict], job_id: int) -> None:
    driver = get_neo4j_driver()
    with driver.session() as session:
        # 任务失败后重试时清掉本次图谱的半成品，保证不会重复累加。
        session.run(
            "MATCH (n) WHERE n.graph_id = $graph_id DETACH DELETE n",
            graph_id=graph_id,
        ).consume()

        total_node_batches = max(1, (len(nodes) + 499) // 500)
        for batch_index, batch in enumerate(_chunks(nodes), start=1):
            session.run(
                """
                UNWIND $rows AS row
                CREATE (n:Entity {
                    graph_id: $graph_id,
                    name: row.name,
                    name_orig: row.name,
                    norm_name: row.norm_name,
                    node_type: row.node_type
                })
                """,
                graph_id=graph_id,
                rows=[{**row, "norm_name": _norm_name(row["name"])} for row in batch],
            ).consume()
            progress = 35 + int(batch_index / total_node_batches * 35)
            _update_job(
                job_id,
                status=GraphBuildStatus.BUILDING,
                progress=min(progress, 70),
                current_stage="写入节点",
            )

        total_edge_batches = max(1, (len(relationships) + 499) // 500)
        for batch_index, batch in enumerate(_chunks(relationships), start=1):
            session.run(
                """
                UNWIND $rows AS row
                MATCH (source:Entity {graph_id: $graph_id, name: row.source})
                MATCH (target:Entity {graph_id: $graph_id, name: row.target})
                CREATE (source)-[:RELATED_TO {
                    graph_id: $graph_id,
                    relation_name: row.relation
                }]->(target)
                """,
                graph_id=graph_id,
                rows=batch,
            ).consume()
            progress = 70 + int(batch_index / total_edge_batches * 25)
            _update_job(
                job_id,
                status=GraphBuildStatus.BUILDING,
                progress=min(progress, 95),
                current_stage="写入关系",
            )


def build_graph_job(job_id: int) -> None:
    """后台任务入口；任何异常都会被记录到任务和图谱目录。"""
    db = SessionLocal()
    job = None
    try:
        job = db.query(GraphBuildJob).filter(GraphBuildJob.id == job_id).first()
        if not job:
            return
        graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == job.graph_id).first()
        if not graph:
            raise RuntimeError("图谱目录不存在")

        job.status = GraphBuildStatus.EXTRACTING
        job.progress = 10
        job.current_stage = "读取文本"
        job.started_at = datetime.utcnow()
        graph.status = GraphStatus.PROCESSING
        db.commit()

        text = Path(job.source_path).read_text(encoding="utf-8-sig")
        nodes, relationships = parse_structured_text(text)
        if not nodes:
            raise ValueError("没有解析到实体。请使用“实体：名称 / 类型：类型”的格式。")

        _update_job(
            job_id,
            status=GraphBuildStatus.BUILDING,
            progress=30,
            current_stage=f"已解析 {len(nodes)} 个实体 / {len(relationships)} 条关系",
        )
        _write_to_neo4j(graph.slug, nodes, relationships, job_id)

        stats = get_graph_summary(graph.slug)
        db.refresh(graph)
        graph.node_count = stats["nodes"]
        graph.edge_count = stats["relationships"]
        graph.status = GraphStatus.READY
        job = db.query(GraphBuildJob).filter(GraphBuildJob.id == job_id).first()
        job.status = GraphBuildStatus.READY
        job.progress = 100
        job.current_stage = "构建完成"
        job.finished_at = datetime.utcnow()
        db.commit()
        invalidate_entity_cache()
    except Exception as exc:
        db.rollback()
        if job is None:
            job = db.query(GraphBuildJob).filter(GraphBuildJob.id == job_id).first()
        if job:
            job.status = GraphBuildStatus.FAILED
            job.progress = 100
            job.current_stage = "构建失败"
            job.error_message = str(exc)[:2000]
            job.finished_at = datetime.utcnow()
            graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == job.graph_id).first()
            if graph:
                graph.status = GraphStatus.FAILED
            db.commit()
        print(f"❌ 图谱构建任务 {job_id} 失败: {exc}")
    finally:
        db.close()
