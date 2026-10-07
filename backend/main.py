"""
知识图谱问答系统后端主程序
集成FastAPI、MySQL、Neo4j、Ollama等服务

启动方式（必须在仓库根目录，且以模块方式启动）：
    python -m uvicorn backend.main:app --reload --port 8000
"""

# ========================================
# 包上下文检查
# ========================================
# 原实现用 sys.path.insert + try/except 同时支持 `backend.core` 和 `core` 两套导入路径，
# 结果"能不能启动"取决于你在哪个目录敲命令，而且 ImportError 会被吞掉只打印一行。
# 这里改为只支持唯一的启动方式，不满足时给出明确指引。
if __package__ in (None, ""):
    raise SystemExit(
        "启动方式不正确：必须以模块方式从仓库根目录启动，例如\n"
        "    python -m uvicorn backend.main:app --reload --port 8000\n"
        "直接用 `uvicorn main:app`（在 backend 目录内）或 `python backend/main.py` 时\n"
        "没有包上下文，backend.core / backend.utils 里的相对导入会失败。"
    )

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

# ========================================
# 导入核心模块
# ========================================
from backend.core import init_db, get_db, UserRole, create_user, get_user_by_username

# ========================================
# 导入子模块路由
# ========================================
from backend.admin import admin_router
from backend.customer import customer_router
from backend.functions import functions_router
from backend.kg_manager import router as kg_router
from backend.core.config import CORS_ORIGINS

# ========================================
# 导入工具模块
# ========================================
from backend.utils import (
    get_neo4j_driver,
    get_llm_client,
    get_system_health,
    get_graph_summary,
    get_sample_triples,
    get_full_graph,
    # 中英双层对照
    list_dual_malware,
    get_dual_layer_graph,
    get_node_detail,
    # LLM 运行时设置（设置页）
    get_llm_settings,
    update_llm_settings,
    test_llm_settings,
    close_driver
)

# 设置接口涉及 API Key，必须限管理员（复用既有的 JWT / X-Admin-Token 鉴权）
from backend.admin.routes import require_admin

# ========================================
# FastAPI 应用初始化
# ========================================

app = FastAPI(
    title="知识图谱问答系统",
    description="集成Neo4j知识图谱和本地LLM的智能问答系统",
    version="1.0.0"
)

# ========================================
# 中间件配置
# ========================================

# CORS中间件 - 仅允许已知的前端来源（可用 CORS_ORIGINS 环境变量覆盖）
# 原先的 allow_origins=["*"] + allow_credentials=True 是无效组合：浏览器规范
# 禁止在凭据请求中使用通配源。前端使用 Bearer Token，不依赖 Cookie。
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 添加自定义错误处理中间件
@app.middleware("http")
async def error_handler(request: Request, call_next):
    """
    全局错误处理中间件
    捕获并处理所有未被捕获的异常
    """
    try:
        response = await call_next(request)
        return response
    except HTTPException:
        # 让HTTPException正常传播
        raise
    except Exception as e:
        # 记录错误但不暴露敏感信息
        import traceback
        print(f"❌ 未处理的异常: {str(e)}")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"detail": "服务器内部错误，请稍后重试"}
        )


# ========================================
# 数据库初始化
# ========================================

@app.on_event("startup")
async def startup_event():
    """
    应用启动事件
    初始化数据库和创建默认管理员账户
    """
    # Step 1: 初始化MySQL数据库
    try:
        init_db()
        print("✅ MySQL 数据库初始化成功")
    except Exception as e:
        print(f"❌ MySQL 初始化失败: {e}")
        # 不抛出异常，允许应用继续启动，但会在健康检查中显示错误
    
    # Step 2: 创建默认管理员账户
    try:
        db = next(get_db())
        admin_user = get_user_by_username(db, "admin")
        if not admin_user:
            admin_user = create_user(
                db=db,
                username="admin",
                email="admin@system.local",
                password="admin123",
                full_name="系统管理员",
                role=UserRole.ADMIN
            )
            print(f"✅ 默认管理员账户已创建: admin/admin123")
        else:
            print("✅ 管理员账户已存在")
        db.close()
    except Exception as e:
        print(f"⚠️ 管理员账户创建/检查失败: {e}")
        # 不抛出异常，允许应用继续启动


@app.on_event("shutdown")
async def shutdown_event():
    """
    应用关闭事件
    清理资源
    """
    try:
        close_driver()
        print("✅ Neo4j 驱动已关闭")
    except Exception as e:
        print(f"⚠️ 关闭驱动失败: {e}")


# ========================================
# 子模块路由注册
# ========================================

# 注册管理员路由
app.include_router(admin_router)

# 注册客户路由
app.include_router(customer_router)

# 注册函数路由
app.include_router(functions_router)

# 注册知识图谱管理路由（/api/kg/stats、/api/kg/sample、/api/kg/node 增删改）
app.include_router(kg_router)


# ========================================
# 公开API端点
# ========================================

@app.get("/")
async def root():
    """
    根路由
    返回API信息
    """
    return {
        "title": "知识图谱问答系统 API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/api/health",
            "qa": "/api/qa/ask",
            "reasoning": "/api/reasoning/reason",
            "prediction": "/api/prediction/predict",
            "graph": "/api/graph/summary",
            "admin": "/api/admin/*",
            "customer": "/api/customer/*"
        }
    }


@app.get("/api/health")
async def health_check():
    """
    系统健康检查端点
    检查所有外部服务的连接状态
    
    Returns:
        dict: 包含各个服务状态的信息
    """
    health = get_system_health()
    return health


# ========================================
# 知识图谱API
# ========================================

@app.get("/api/graph/summary")
async def graph_summary():
    """
    获取知识图谱统计信息
    
    Returns:
        dict: 包含节点数和关系数
    """
    try:
        summary = get_graph_summary()
        return {
            "success": True,
            "data": summary
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取图谱信息失败: {str(e)}")


@app.get("/api/graph/samples")
async def graph_samples(limit: int = 20):
    """
    获取知识图谱样本数据
    
    Args:
        limit: 返回三元组的数量
        
    Returns:
        dict: 包含样本三元组的数据
    """
    try:
        samples = get_sample_triples(limit)
        return {
            "success": True,
            "data": samples
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取样本数据失败: {str(e)}")


@app.get("/api/graph/full")
async def graph_full(
    limit: int = 800,
    seeds: int = 25,
    offset: int = 0,
    hide_text: bool = False,
):
    """
    获取知识图谱可视化子图（节点 + 边）

    采样方式是**以恶意软件为种子展开邻域**，而不是
    `MATCH (n)-[r]->(m) LIMIT n`。后者因为 rels.csv 是**按关系类型分组**导入的，
    Neo4j 会走关系扫描，只会取到同一种关系的边 ——
    实测 200 条边只连出 207 个节点、关系种类 = 1，画出来是 200 个孤立小星形。

    Args:
        limit: 最多返回多少条关系
        seeds: 取多少个恶意软件作种子（样本规模主要由它决定）
        offset: 种子偏移量，供前端"换一批"使用
        hide_text: 是否隐藏句子型节点（解决方案/病毒行为/综合描述等长文本）

    Returns:
        dict: {"success": True, "data": {nodes, edges, meta}}
    """
    try:
        graph_data = get_full_graph(
            limit=limit, seeds=seeds, offset=offset, hide_text=hide_text
        )
        return {
            "success": True,
            "data": graph_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取图谱数据失败: {str(e)}")


# ========================================
# 中英双层对照API
# ========================================
# 当前图谱 schema：中英各一套单语节点（lang = "cn" / "en"），
# 关系名就是源数据字段名（中文层「病毒家族/运行环境/解决方案…」，英文层「Family/Platform/Solution…」），
# 且**只有核心节点（恶意软件本体）之间存在 ALIGN_WITH 映射**。

@app.get("/api/graph/malware-list")
async def graph_malware_list(limit: int = 300, keyword: str = ""):
    """
    列出可用于中英对照的恶意软件（核心节点已建立 ALIGN_WITH 映射的）

    只有中英两层都存在的病毒才能对照 —— 两个源文件的病毒集合并不完全相同
    （各 51,802 / 51,805 条记录）。

    Args:
        limit: 最多返回多少个
        keyword: 名称关键字过滤（不区分大小写）

    Returns:
        dict: {"success": True, "data": [{name, mal_type, degree}]}
    """
    try:
        return {"success": True, "data": list_dual_malware(limit=limit, keyword=keyword)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取对照病毒列表失败: {str(e)}")


@app.get("/api/graph/layers")
async def graph_layers(virus: Optional[str] = None, limit: int = 120):
    """
    获取中英双层对照子图（前端左右两个面板的数据来源）

    Args:
        virus: 恶意软件名称；留空时自动挑一个关系最丰富、且中英两层都有的病毒
        limit: 每层最多返回多少条关系

    Returns:
        dict: {"success": True, "data": {virus, cn:{nodes,edges}, en:{nodes,edges}, core, matched}}
    """
    try:
        name = (virus or "").strip()
        if not name:
            candidates = list_dual_malware(limit=1)
            if not candidates:
                return {
                    "success": True,
                    "data": None,
                    "message": "图谱中没有可用于中英对照的病毒（需核心节点已建立 ALIGN_WITH 映射）",
                }
            name = candidates[0]["name"]

        return {"success": True, "data": get_dual_layer_graph(name, limit=limit)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取双层图谱失败: {str(e)}")


@app.get("/api/graph/node-detail")
async def graph_node_detail(norm_name: str):
    """
    查询"同一个实体的中英两版"节点属性，供前端并排对比

    只接受 norm_name 是因为它是唯一带索引的字段（entity_norm_name）；
    用 name / name_orig 查询会在 170 万节点上做全表扫描。

    Args:
        norm_name: 节点规范化名（由 /api/graph/layers 返回的节点自带该字段）

    Returns:
        dict: {"success": True, "data": {"cn": {...}|None, "en": {...}|None}}
    """
    try:
        return {"success": True, "data": get_node_detail(norm_name)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取节点详情失败: {str(e)}")


# ========================================
# LLM 运行时设置API（设置页）
# ========================================
# 涉及 API Key，全部限管理员：沿用既有的 require_admin（JWT 管理员 / X-Admin-Token / admin_token）

class LLMSettingsRequest(BaseModel):
    """LLM 设置更新请求；字段为 None 表示不修改该项"""
    api_key: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None


@app.get("/api/settings/llm")
async def read_llm_settings(_admin=Depends(require_admin)):
    """
    读取当前 LLM 设置（密钥已掩码，不会回传明文）

    Returns:
        dict: {"success": True, "data": {provider, model, api_key_set, api_key_masked, ...}}
    """
    try:
        return {"success": True, "data": get_llm_settings()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取设置失败: {str(e)}")


@app.put("/api/settings/llm")
async def write_llm_settings(payload: LLMSettingsRequest, _admin=Depends(require_admin)):
    """
    更新 LLM 设置：立即生效并写回 .env（重启后依然有效）

    Returns:
        dict: {"success": True, "data": 最新设置, "updated": [已更新的键]}
    """
    try:
        result = update_llm_settings(
            api_key=payload.api_key,
            provider=payload.provider,
            model=payload.model,
            base_url=payload.base_url,
        )
        return {
            "success": True,
            "data": result["settings"],
            "updated": result["updated"],
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存设置失败: {str(e)}")


@app.post("/api/settings/llm/test")
async def test_llm_settings_route(_admin=Depends(require_admin)):
    """
    用当前设置探测 LLM 是否真的可用（不消耗 token）

    Returns:
        dict: {"success": True, "data": {ok, provider, model, message}}
    """
    try:
        return {"success": True, "data": test_llm_settings()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"测试失败: {str(e)}")


# ========================================
# 身份验证API
# ========================================

# Pydantic 模型
class LoginRequest(BaseModel):
    """登录请求模型"""
    username: str
    password: str


@app.post("/api/auth/login")
async def login(
    request: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    用户登录端点
    
    Args:
        request: 登录请求体（包含username和password）
        db: 数据库会话
        
    Returns:
        dict: 包含access_token的登录结果
    """
    from backend.admin.auth import create_access_token, authenticate_user
    from datetime import timedelta
    from backend.core.config import ACCESS_TOKEN_EXPIRE_MINUTES
    
    # 认证用户
    user = authenticate_user(db, request.username, request.password)
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    
    # 创建访问令牌
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )
    
    return {
        "success": True,
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role.value
        }
    }


# ========================================
# 身份验证API
# ========================================

class RegisterRequest(BaseModel):
    """注册请求模型"""
    username: str
    email: str
    password: str
    full_name: str = None


@app.post("/api/auth/register")
async def register(
    request: RegisterRequest,
    db: Session = Depends(get_db)
):
    """
    用户注册端点
    创建新的客户账户
    
    Args:
        request: 注册请求体（包含username、email、password、full_name）
        db: 数据库会话
        
    Returns:
        dict: 注册结果
    """
    from backend.core import get_user_by_email, create_customer_profile
    
    # 检查用户名和邮箱是否已存在
    if get_user_by_username(db, request.username):
        raise HTTPException(status_code=400, detail="用户名已存在")
    
    if get_user_by_email(db, request.email):
        raise HTTPException(status_code=400, detail="邮箱已被注册")
    
    # 创建新用户
    try:
        user = create_user(
            db=db,
            username=request.username,
            email=request.email,
            password=request.password,
            full_name=request.full_name or request.username,
            role=UserRole.CUSTOMER
        )
        
        # 创建客户资料
        create_customer_profile(db, user.id)
        
        return {
            "success": True,
            "message": "注册成功",
            "user_id": user.id,
            "username": user.username
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"注册失败: {str(e)}")


# ========================================
# 错误处理
# ========================================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """
    自定义HTTP异常处理器
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )