"""TXT/Markdown 建图任务。

文本建图采用“DeepSeek JSON 抽取 + 本地校验 + Neo4j 写入”的流程：

1. 将文本按段落切成较小的上下文块；
2. 调用现有 LLM 客户端抽取实体、实体类型和关系；
3. 只接受 JSON，规范化字段并过滤没有实体端点的关系；
4. 对节点和三元组去重后，复用现有 Neo4j 写入逻辑。

确定性解析器仍保留在模块中，便于兼容旧调用和测试；上传建图任务默认走 LLM 抽取。
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from .core.models import (
    GraphBuildJob,
    GraphBuildStatus,
    GraphStatus,
    KnowledgeGraph,
    SessionLocal,
)
from .functions.retrieval import invalidate_entity_cache
from .utils.llm import get_llm_client
from .utils.neo4j_utils import get_graph_summary, get_neo4j_driver


_ENTITY_RE = re.compile(r"^(?:实体|entity)\s*[:：]\s*(.+)$", re.IGNORECASE)
_TYPE_RE = re.compile(r"^(?:类型|type)\s*[:：]\s*(.+)$", re.IGNORECASE)
_RELATION_RE = re.compile(r"^(?:关系|relation)\s*[:：]\s*(.+)$", re.IGNORECASE)
_ARROW_RE = re.compile(r"^(.*?)\s*[-—]\s*(.*?)\s*(?:->|→)\s*(.+?)$")
_SHORT_ARROW_RE = re.compile(r"^(.*?)\s*(?:->|→)\s*(.+?)$")

# LLM 抽取时优先使用这些领域类型/关系；如果用户文本出现新概念，允许模型返回
# 简短的自定义类型或关系，避免把非恶意软件文档中的有效知识全部丢掉。
_ENTITY_TYPE_GUIDE = (
    "Malware（恶意软件）、Family（家族）、Platform（运行环境）、"
    "MalwareType（威胁类型）、Category（威胁行为分类）、Alias（别名）、"
    "Behavior（行为）、Solution（解决方案）、Vulnerability（漏洞）、"
    "Organization（组织）、Product（产品）、Technology（技术）、Entity（其他实体）"
)
_RELATION_GUIDE = (
    "病毒家族、运行环境、威胁类型、威胁行为、病毒行为、解决方案、"
    "其他厂商命名、利用、影响、使用、属于、包含、依赖、版本、发现、关联"
)
_LLM_CHUNK_CHARS = 5000
_LLM_EXTRACTION_MAX_TOKENS = 2048


def _clean(value: str, max_length: int = 240) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())[:max_length]


def _node_type(value: str) -> str:
    """保留用户可读类型；类型作为属性写入，避免动态 Cypher 标签注入。"""
    return _clean(value, 64) or "Entity"


def _norm_name(value: str) -> str:
    return re.sub(r"\s+", " ", _clean(value, 240)).casefold()


def _split_text_for_extraction(text: str, max_chars: int = _LLM_CHUNK_CHARS) -> List[str]:
    """按段落切分文本，避免一次请求过长，也尽量不切断语义。"""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n+", text or "") if p.strip()]
    if not paragraphs:
        return []

    chunks: List[str] = []
    current: List[str] = []
    current_len = 0

    def flush() -> None:
        nonlocal current, current_len
        if current:
            chunks.append("\n\n".join(current))
            current = []
            current_len = 0

    for paragraph in paragraphs:
        # 单段过长时按字符切分，避免请求超过上下文窗口。
        if len(paragraph) > max_chars:
            flush()
            for start in range(0, len(paragraph), max_chars):
                part = paragraph[start:start + max_chars].strip()
                if part:
                    chunks.append(part)
            continue

        extra_len = len(paragraph) + (2 if current else 0)
        if current and current_len + extra_len > max_chars:
            flush()
        current.append(paragraph)
        current_len += len(paragraph) + (2 if len(current) > 1 else 0)

    flush()
    return chunks


def _extract_json_payload(content: str) -> Dict[str, Any]:
    """从模型回答中提取 JSON，兼容 Markdown 代码块和少量前后解释文字。"""
    raw = (content or "").strip()
    if not raw:
        raise ValueError("LLM 返回为空")

    candidates = [raw]
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.IGNORECASE | re.DOTALL)
    if fenced:
        candidates.insert(0, fenced.group(1))

    start = raw.find("{")
    end = raw.rfind("}")
    if start >= 0 and end > start:
        candidates.append(raw[start:end + 1])

    last_error: Optional[Exception] = None
    for candidate in candidates:
        try:
            payload = json.loads(candidate)
            if isinstance(payload, list):
                payload = {"entities": payload, "relations": []}
            if isinstance(payload, dict):
                return payload
        except (TypeError, json.JSONDecodeError) as exc:
            last_error = exc

    raise ValueError(f"LLM 未返回合法 JSON: {last_error or '未知格式'}")


def _first_value(item: Dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = item.get(key)
        if value is not None:
            return value
    return None


def _normalize_extracted_graph(
    raw_entities: Any,
    raw_relations: Any,
) -> Tuple[List[Dict[str, str]], List[Dict[str, str]]]:
    """规范化模型输出，并过滤关系端点不存在的关系。"""
    nodes_by_norm: Dict[str, Dict[str, str]] = {}

    if not isinstance(raw_entities, list):
        raw_entities = []
    for item in raw_entities:
        if not isinstance(item, dict):
            continue
        name = _clean(str(_first_value(item, "name", "entity", "text") or ""))
        if not name:
            continue
        node_type = _node_type(str(_first_value(item, "type", "entity_type", "node_type") or "Entity"))
        norm = _norm_name(name)
        if not norm:
            continue

        existing = nodes_by_norm.get(norm)
        if existing is None or existing["node_type"] == "Entity":
            nodes_by_norm[norm] = {"name": name, "node_type": node_type}

    raw_relations = raw_relations if isinstance(raw_relations, list) else []
    relationships_by_key: Dict[Tuple[str, str, str], Dict[str, str]] = {}
    for item in raw_relations:
        if not isinstance(item, dict):
            continue
        source = _clean(str(_first_value(item, "source", "subject", "from") or ""))
        target = _clean(str(_first_value(item, "target", "object", "to") or ""))
        relation = _clean(str(_first_value(item, "relation", "predicate", "type") or ""), 120)
        if not source or not target or not relation:
            continue

        source_node = nodes_by_norm.get(_norm_name(source))
        target_node = nodes_by_norm.get(_norm_name(target))
        # 模型可能凭空输出一个关系端点；只有两端都在实体集合中才允许入图。
        if source_node is None or target_node is None:
            continue

        key = (
            _norm_name(source_node["name"]),
            _norm_name(relation),
            _norm_name(target_node["name"]),
        )
        relationships_by_key[key] = {
            "source": source_node["name"],
            "relation": relation,
            "target": target_node["name"],
        }

    return list(nodes_by_norm.values()), list(relationships_by_key.values())


def _build_extraction_prompt(chunk: str) -> str:
    return f"""你是知识图谱信息抽取器。请只根据【原文】抽取明确表达的实体和关系，不要猜测，不要补充原文没有的信息。

【实体类型参考】
{_ENTITY_TYPE_GUIDE}

【关系类型参考】
{_RELATION_GUIDE}

【输出要求】
1. 只输出一个合法 JSON 对象，不要 Markdown 代码块，不要解释文字；
2. JSON 必须严格使用以下结构：
{{
  "entities": [{{"name": "实体名称", "type": "实体类型"}}],
  "relations": [{{"source": "源实体名称", "relation": "关系名称", "target": "目标实体名称"}}]
}};
3. 关系的 source 和 target 必须逐字对应 entities 中的 name；
4. 没有明确实体或关系时返回空数组；
5. 实体名称保留原文中的核心名称，不要把整段句子当成实体；
6. type 和 relation 使用简短名称，优先使用参考列表，参考列表没有时再使用原文中的简短类型/关系。

【原文】
{chunk}
"""


def extract_graph_with_llm(
    text: str,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> Tuple[List[Dict[str, str]], List[Dict[str, str]]]:
    """使用当前配置的 LLM 抽取自然语言中的实体、类型和关系。"""
    chunks = _split_text_for_extraction(text)
    if not chunks:
        return [], []

    client = get_llm_client()
    if not client.is_available():
        reason = getattr(client, "last_error", None) or "LLM 后端不可用"
        raise RuntimeError(f"自然语言建图需要可用的 LLM：{reason}")

    all_entities: List[Dict[str, Any]] = []
    all_relations: List[Dict[str, Any]] = []
    for index, chunk in enumerate(chunks, start=1):
        response = client.chat(
            messages=[{"role": "user", "content": _build_extraction_prompt(chunk)}],
            temperature=0.0,
            max_tokens=_LLM_EXTRACTION_MAX_TOKENS,
        )
        content = (response.get("message", {}).get("content") or "").strip()
        if not content:
            raise RuntimeError(f"第 {index}/{len(chunks)} 个文本块的 LLM 返回为空")

        payload = _extract_json_payload(content)
        entities = payload.get("entities", payload.get("nodes", []))
        relations = payload.get("relations", payload.get("relationships", payload.get("edges", [])))
        if isinstance(entities, list):
            all_entities.extend(entities)
        if isinstance(relations, list):
            all_relations.extend(relations)
        if progress_callback:
            progress_callback(index, len(chunks))

    nodes, relationships = _normalize_extracted_graph(all_entities, all_relations)
    if not nodes:
        raise ValueError("LLM 未从文本中抽取到实体，请检查文本内容或 DeepSeek 配置")
    return nodes, relationships


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

        def on_extraction_progress(done: int, total: int) -> None:
            progress = 10 + int(done / max(total, 1) * 20)
            _update_job(
                job_id,
                status=GraphBuildStatus.EXTRACTING,
                progress=min(progress, 30),
                current_stage=f"LLM 抽取文本（{done}/{total}）",
            )

        nodes, relationships = extract_graph_with_llm(text, on_extraction_progress)
        if not nodes:
            raise ValueError("没有从文本中抽取到实体")

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
