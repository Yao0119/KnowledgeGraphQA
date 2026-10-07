"""
配置管理模块
存储应用的所有配置参数，包括数据库、认证、LLM等

所有敏感项都可通过环境变量覆盖，未设置时使用下面的本地开发默认值。
生产部署请务必设置 SECRET_KEY、MYSQL_PASSWORD、NEO4J_PASSWORD。
"""

import os
import sys

# ========================================
# 标准输出编码（Windows 兼容）
# ========================================
# 项目里大量使用 ✅ / ⚠️ / ❌ 等 emoji 打印日志，而 Windows 控制台默认是 GBK 代码页。
# 只要有一行这样的打印走到 GBK 编码，就会抛 UnicodeEncodeError 并直接中断启动
# （例如下面那句 SECRET_KEY 警告，会让 uvicorn 连 app 都 import 不进来）。
# 这里统一把 stdout/stderr 切到 UTF-8，并用 errors="replace" 兜底，
# 保证任何日志都不会把进程打崩。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

# ========================================
# .env 加载（可选）
# ========================================
# 仓库根目录或 backend/ 下存在 .env 时自动读取，已存在的环境变量优先（override=False）。
# python-dotenv 随 uvicorn[standard] 一起安装；缺失时静默跳过，不影响启动。
try:
    from dotenv import load_dotenv

    _ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    for _env_file in (os.path.join(_ROOT, ".env"), os.path.join(_ROOT, "backend", ".env")):
        if os.path.exists(_env_file):
            load_dotenv(_env_file, override=False)
except ImportError:
    pass



def _env(name: str, default: str) -> str:
    """
    读取环境变量，未设置或为空串时回退到默认值

    Args:
        name: 环境变量名
        default: 默认值

    Returns:
        str: 环境变量值或默认值
    """
    value = os.getenv(name)
    return value if value not in (None, "") else default


# ========================================
# 安全配置
# ========================================
SECRET_KEY = _env("SECRET_KEY", "change-this-secret-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(_env("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

# 管理员静态令牌：仅用于本地脚本 / 命令行 / 测试。
# 管理端页面用的是登录返回的 JWT，浏览器里不再硬编码该令牌。
ADMIN_TOKEN = _env("ADMIN_TOKEN", "CHANGE_ME_ADMIN_TOKEN")

if SECRET_KEY == "change-this-secret-key":
    print("⚠️ SECRET_KEY 仍为默认值，仅可用于本地开发；请设置环境变量 SECRET_KEY。")

# ========================================
# Neo4j 知识图谱数据库配置
# ========================================
# ⚠️ 口令**不提供可用默认值**：这里只是占位符，真实值请写进仓库根目录的 .env
#    （.env 已被 .gitignore 忽略，不会进版本库），或用环境变量注入。
NEO4J_URI = _env("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = _env("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = _env("NEO4J_PASSWORD", "CHANGE_ME_NEO4J_PASSWORD")

# ========================================
# MySQL 关系型数据库配置
# ========================================
MYSQL_HOST = _env("MYSQL_HOST", "localhost")
MYSQL_USER = _env("MYSQL_USER", "root")
MYSQL_PASSWORD = _env("MYSQL_PASSWORD", "CHANGE_ME_MYSQL_PASSWORD")
MYSQL_DATABASE = _env("MYSQL_DATABASE", "kg_qa_system")
MYSQL_PORT = int(_env("MYSQL_PORT", "3306"))

# 启动时集中提示还留在占位符上的敏感项，避免出现"连不上但不知道为什么"
_PLACEHOLDERS = {
    "SECRET_KEY": SECRET_KEY,
    "ADMIN_TOKEN": ADMIN_TOKEN,
    "NEO4J_PASSWORD": NEO4J_PASSWORD,
    "MYSQL_PASSWORD": MYSQL_PASSWORD,
}
_unchanged = [k for k, v in _PLACEHOLDERS.items() if not v or v.startswith(("CHANGE_ME", "change-this"))]
if _unchanged:
    print(
        "⚠️ 以下配置仍是占位符，请复制 .env.example 为 .env 并填入真实值："
        + "、".join(_unchanged)
    )

# SQLAlchemy 数据库连接字符串
# 添加charset=utf8mb4以支持中文和emoji，添加连接池参数
DATABASE_URL = _env(
    "DATABASE_URL",
    f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}?charset=utf8mb4",
)

# ========================================
# CORS 配置
# ========================================
# 原实现是 allow_origins=["*"] 搭配 allow_credentials=True —— 这是无效且不安全的组合：
# 浏览器规范禁止凭据请求使用通配源，Starlette 实际上也不会回显你的 Origin。
# 前端用 localStorage 里的 Bearer Token（不是 Cookie），所以这里不需要 credentials。
CORS_ORIGINS = [
    origin.strip()
    for origin in _env(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

# ========================================
# LLM 配置
# ========================================
# 支持两种后端，通过 LLM_PROVIDER 切换（默认使用 DeepSeek 云端 API）：
#   "deepseek" —— 调用 https://api.deepseek.com（OpenAI 兼容格式）
#   "ollama"   —— 调用本地 Ollama 服务
LLM_PROVIDER = _env("LLM_PROVIDER", "deepseek").strip().lower()

# ---- DeepSeek API ----
# API Key 请通过环境变量注入，**不要写进源码**。
# 未配置时相关功能会明确提示"未配置 DEEPSEEK_API_KEY"，而不是抛异常。
DEEPSEEK_API_KEY = _env("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = _env("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
# 官方文档：model 名用 `deepseek-flash`，它对应的模型版本就是 DeepSeek-V4.1-Flash；
# 旧名 `deepseek-v4-flash` 仍被接受但模型已下线（请求由 V4.1-Flash 承接）。
# 需要更强推理时可用 `deepseek-v4-pro`。
DEEPSEEK_MODEL = _env("DEEPSEEK_MODEL", "deepseek-flash")
# DeepSeek 的思考模式**默认开启**；这里默认显式关闭以获得更快更省的回答，
# 需要思考链时把 DEEPSEEK_THINKING 设为 enabled。
DEEPSEEK_THINKING = _env("DEEPSEEK_THINKING", "disabled").strip().lower()  # enabled | disabled | ""
DEEPSEEK_REASONING_EFFORT = _env("DEEPSEEK_REASONING_EFFORT", "").strip()  # low | medium | high | ""
DEEPSEEK_TIMEOUT = int(_env("DEEPSEEK_TIMEOUT", "120"))

# ---- 本地 Ollama ----
OLLAMA_BASE_URL = _env("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = _env("OLLAMA_MODEL", "qwen:1.8b")  # 可用模型: qwen:1.8b, qwen:7b, chatglm:6b, llama2:7b

# 通用 LLM 生成参数
LLM_TEMPERATURE = float(_env("LLM_TEMPERATURE", "0.3"))
LLM_MAX_TOKENS = int(_env("LLM_MAX_TOKENS", "1024"))

# ========================================
# 知识图谱检索配置
# ========================================
# 单次提问最多参与匹配的候选词数量。
# 关键词通过参数化 Cypher 的 any(...) 使用，几十个字符串的开销可以忽略；
# 给足额度才不会把问句后半段的实体切掉。
KG_MAX_TERMS = int(_env("KG_MAX_TERMS", "32"))
# 单次检索返回的三元组上限
KG_MAX_TRIPLES = int(_env("KG_MAX_TRIPLES", "25"))
# 是否对命中的节点做 1 跳邻居扩展（能显著提升证据完整度，代价是多一次查询）
KG_EXPAND_NEIGHBORS = _env("KG_EXPAND_NEIGHBORS", "true").lower() in ("1", "true", "yes")
# 邻居扩展时最多使用的种子节点数
KG_EXPAND_SEEDS = int(_env("KG_EXPAND_SEEDS", "8"))

# ========================================
# API 配置
# ========================================
API_HOST = _env("API_HOST", "127.0.0.1")
API_PORT = int(_env("API_PORT", "8000"))
DEBUG = _env("DEBUG", "true").lower() in ("1", "true", "yes")

# ========================================
# 日志配置
# ========================================
LOG_LEVEL = _env("LOG_LEVEL", "INFO")
