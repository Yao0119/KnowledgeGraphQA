"""图谱目录与当前用户可见图谱接口。"""

from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .core import (
    GraphPermission,
    GraphBuildJob,
    GraphBuildStatus,
    GraphSourceType,
    GraphStatus,
    KnowledgeGraph,
    KnowledgeGraphMember,
    User,
    get_db,
)
from .customer.routes import get_current_customer
from .utils.neo4j_utils import get_graph_summary, get_sample_triples
from .graph_builder import build_graph_job

router = APIRouter(prefix="/api/graphs", tags=["Graphs"])
jobs_router = APIRouter(prefix="/api/graph-build-jobs", tags=["Graph Build Jobs"])

MAX_GRAPH_UPLOAD_BYTES = 10 * 1024 * 1024
GRAPH_UPLOAD_ROOT = Path(__file__).resolve().parent / "data" / "graph_uploads"


class GraphCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    description: Optional[str] = Field(None, max_length=2000)
    language_mode: str = Field("dual", pattern="^(cn|en|dual)$")


def _can_view(graph: KnowledgeGraph, user: User) -> bool:
    if graph.is_builtin or graph.is_public or graph.owner_id == user.id:
        return True
    return any(member.user_id == user.id for member in graph.members)


def _serialize_job(job: Optional[GraphBuildJob]) -> Optional[dict]:
    if not job:
        return None
    return {
        "job_id": job.id,
        "status": job.status.value if hasattr(job.status, "value") else job.status,
        "progress": job.progress or 0,
        "current_stage": job.current_stage or "等待开始",
        "source_file_name": job.source_file_name,
        "source_file_size": job.source_file_size,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }


def _latest_job(graph: KnowledgeGraph) -> Optional[GraphBuildJob]:
    return max(
        graph.build_jobs or [],
        key=lambda item: item.created_at or datetime.min,
        default=None,
    )


def _serialize(graph: KnowledgeGraph, job: Optional[GraphBuildJob] = None) -> dict:
    data = {
        "id": graph.id,
        "graph_id": graph.slug,
        "slug": graph.slug,
        "name": graph.name,
        "description": graph.description or "",
        "owner_id": graph.owner_id,
        "is_builtin": graph.is_builtin,
        "is_public": graph.is_public,
        "status": graph.status.value if hasattr(graph.status, "value") else graph.status,
        "source_type": graph.source_type.value if hasattr(graph.source_type, "value") else graph.source_type,
        "language_mode": graph.language_mode,
        "node_count": graph.node_count or 0,
        "edge_count": graph.edge_count or 0,
        "created_at": graph.created_at.isoformat() if graph.created_at else None,
        "updated_at": graph.updated_at.isoformat() if graph.updated_at else None,
    }
    data["build_job"] = _serialize_job(job or _latest_job(graph))
    return data


def _get_visible_graph(graph_id: str, user: User, db: Session) -> KnowledgeGraph:
    graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.slug == graph_id).first()
    if not graph or not _can_view(graph, user):
        raise HTTPException(status_code=404, detail="图谱不存在或无权访问")
    return graph


@router.get("")
async def list_graphs(
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    graphs = db.query(KnowledgeGraph).order_by(
        KnowledgeGraph.is_builtin.desc(), KnowledgeGraph.updated_at.desc()
    ).all()
    visible = [graph for graph in graphs if _can_view(graph, current_user)]
    # 首次打开目录时把内置图谱的缓存统计补齐；之后直接读 MySQL，避免每次刷新都扫 Neo4j。
    changed = False
    for graph in visible:
        if graph.is_builtin and (graph.node_count == 0 and graph.edge_count == 0):
            stats = get_graph_summary(graph.slug)
            graph.node_count = stats["nodes"]
            graph.edge_count = stats["relationships"]
            changed = True
    if changed:
        db.commit()
    return {"success": True, "data": [_serialize(graph) for graph in visible]}


def _make_slug(db: Session, name: str) -> str:
    slug_base = "graph-" + "-".join(name.lower().split())[:60]
    slug_base = slug_base.strip("-") or "graph"
    slug = slug_base
    suffix = 1
    while db.query(KnowledgeGraph).filter(KnowledgeGraph.slug == slug).first():
        suffix += 1
        slug = f"{slug_base}-{suffix}"
    return slug


@router.post("", status_code=201)
async def create_graph_metadata(
    payload: GraphCreateRequest,
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """先创建目录记录；文本上传建图将在 Phase 3 接入。"""
    slug = _make_slug(db, payload.name)

    graph = KnowledgeGraph(
        slug=slug,
        name=payload.name,
        description=payload.description,
        owner_id=current_user.id,
        is_builtin=False,
        is_public=False,
        status=GraphStatus.PROCESSING,
        source_type=GraphSourceType.TEXT,
        language_mode=payload.language_mode,
    )
    db.add(graph)
    db.flush()
    db.add(KnowledgeGraphMember(graph_id=graph.id, user_id=current_user.id, permission=GraphPermission.OWNER))
    db.commit()
    db.refresh(graph)
    return {"success": True, "data": _serialize(graph), "message": "图谱目录已创建，请继续提交文本构建任务"}


@router.post("/build", status_code=202)
async def create_graph_build(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(""),
    language_mode: str = Form("dual"),
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """上传 TXT/Markdown，并异步构建用户自己的逻辑图谱。"""
    graph_name = (name or "").strip()
    if not graph_name:
        raise HTTPException(status_code=400, detail="图谱名称不能为空")
    if language_mode not in {"cn", "en", "dual"}:
        raise HTTPException(status_code=400, detail="language_mode 只能是 cn、en 或 dual")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".txt", ".md", ".markdown"}:
        raise HTTPException(status_code=400, detail="目前仅支持 TXT、MD、Markdown 文件")

    content = await file.read(MAX_GRAPH_UPLOAD_BYTES + 1)
    if len(content) > MAX_GRAPH_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="文件不能超过 10 MB")
    if not content.strip():
        raise HTTPException(status_code=400, detail="上传文件不能为空")
    try:
        content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="目前仅支持 UTF-8 编码的 TXT/Markdown 文件") from exc

    slug = _make_slug(db, graph_name)
    graph_dir = GRAPH_UPLOAD_ROOT / slug
    graph_dir.mkdir(parents=True, exist_ok=True)
    source_path = graph_dir / f"{uuid4().hex}{suffix}"
    source_path.write_bytes(content)

    graph = KnowledgeGraph(
        slug=slug,
        name=graph_name,
        description=(description or "").strip()[:2000],
        owner_id=current_user.id,
        is_builtin=False,
        is_public=False,
        status=GraphStatus.PROCESSING,
        source_type=GraphSourceType.TEXT,
        language_mode=language_mode,
    )
    db.add(graph)
    db.flush()
    db.add(KnowledgeGraphMember(graph_id=graph.id, user_id=current_user.id, permission=GraphPermission.OWNER))
    job = GraphBuildJob(
        graph_id=graph.id,
        user_id=current_user.id,
        status=GraphBuildStatus.PENDING,
        progress=0,
        current_stage="等待后台任务",
        source_file_name=file.filename or source_path.name,
        source_file_size=len(content),
        source_path=str(source_path),
    )
    db.add(job)
    db.commit()
    db.refresh(graph)
    db.refresh(job)
    background_tasks.add_task(build_graph_job, job.id)

    return {
        "success": True,
        "data": {
            "graph_id": graph.slug,
            "job_id": job.id,
            "status": job.status.value,
            "build_job": _serialize_job(job),
        },
        "message": "文件已接收，图谱将在后台构建",
    }


@router.get("/{graph_id}")
async def get_graph(
    graph_id: str,
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    return {"success": True, "data": _serialize(_get_visible_graph(graph_id, current_user, db))}


@router.get("/{graph_id}/stats")
async def get_graph_stats(
    graph_id: str,
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    graph = _get_visible_graph(graph_id, current_user, db)
    stats = get_graph_summary(graph.slug)
    graph.node_count = stats["nodes"]
    graph.edge_count = stats["relationships"]
    db.commit()
    return {"success": True, "data": stats}


@router.get("/{graph_id}/samples")
async def get_graph_samples(
    graph_id: str,
    limit: int = 20,
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    graph = _get_visible_graph(graph_id, current_user, db)
    return {"success": True, "data": get_sample_triples(limit, graph.slug)}


@jobs_router.get("/{job_id}")
async def get_graph_build_job(
    job_id: int,
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    job = db.query(GraphBuildJob).filter(GraphBuildJob.id == job_id).first()
    if not job or not job.graph or not _can_view(job.graph, current_user):
        raise HTTPException(status_code=404, detail="构建任务不存在或无权访问")
    return {"success": True, "data": {**_serialize_job(job), "graph_id": job.graph.slug}}
