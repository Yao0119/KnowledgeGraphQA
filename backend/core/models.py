"""
数据库模型定义模块
定义所有 SQLAlchemy ORM 模型
"""

from sqlalchemy import create_engine, Column, Integer, String, DateTime, Enum, ForeignKey, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import enum
from .config import DATABASE_URL

# ========================================
# 数据库引擎配置
# ========================================
# 添加连接池配置和错误处理
engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_recycle=3600,
    pool_pre_ping=True,  # 连接前检查连接是否有效
    pool_size=5,  # 连接池大小
    max_overflow=10,  # 最大溢出连接数
    connect_args={"charset": "utf8mb4"}  # 确保使用utf8mb4编码
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class UserRole(str, enum.Enum):
    """
    用户角色枚举
    - ADMIN: 管理员，拥有完整权限
    - CUSTOMER: 客户，普通用户
    """
    ADMIN = "admin"
    CUSTOMER = "customer"


class GraphStatus(str, enum.Enum):
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"
    ARCHIVED = "archived"


class GraphSourceType(str, enum.Enum):
    BUILTIN = "builtin"
    TEXT = "text"
    MANUAL = "manual"
    IMPORTED = "imported"


class GraphPermission(str, enum.Enum):
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


class GraphBuildStatus(str, enum.Enum):
    PENDING = "pending"
    EXTRACTING = "extracting"
    BUILDING = "building"
    READY = "ready"
    FAILED = "failed"
    CANCELLED = "cancelled"


class User(Base):
    """
    用户表
    存储系统中所有用户的基本信息
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, comment="用户ID")
    username = Column(String(50), unique=True, index=True, nullable=False, comment="用户名")
    email = Column(String(100), unique=True, index=True, nullable=False, comment="邮箱")
    hashed_password = Column(String(255), nullable=False, comment="密码哈希值")
    full_name = Column(String(100), comment="全名")
    role = Column(Enum(UserRole), default=UserRole.CUSTOMER, nullable=False, comment="用户角色")
    is_active = Column(Integer, default=1, comment="是否激活")
    created_at = Column(DateTime, default=datetime.utcnow, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, comment="更新时间")

    # 关系定义
    customer_profile = relationship("CustomerProfile", back_populates="user", uselist=False)


class CustomerProfile(Base):
    """
    客户个人资料表
    存储客户的详细信息（电话、地址、公司、部门等）
    """
    __tablename__ = "customer_profiles"

    id = Column(Integer, primary_key=True, index=True, comment="资料ID")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, comment="用户ID")
    phone = Column(String(20), comment="电话号码")
    address = Column(String(255), comment="地址")
    company = Column(String(100), comment="公司名称")
    department = Column(String(100), comment="部门名称")
    created_at = Column(DateTime, default=datetime.utcnow, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, comment="更新时间")

    # 关系定义
    user = relationship("User", back_populates="customer_profile")


class KnowledgeGraph(Base):
    """图谱目录；Neo4j 仍使用单库，graph_id 负责逻辑隔离。"""

    __tablename__ = "knowledge_graphs"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(120), unique=True, index=True, nullable=False)
    name = Column(String(160), nullable=False)
    description = Column(Text, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    is_builtin = Column(Boolean, default=False, nullable=False)
    is_public = Column(Boolean, default=False, nullable=False)
    status = Column(Enum(GraphStatus), default=GraphStatus.READY, nullable=False)
    source_type = Column(Enum(GraphSourceType), default=GraphSourceType.MANUAL, nullable=False)
    language_mode = Column(String(12), default="dual", nullable=False)
    node_count = Column(Integer, default=0, nullable=False)
    edge_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", foreign_keys=[owner_id])
    members = relationship("KnowledgeGraphMember", back_populates="graph", cascade="all, delete-orphan")
    build_jobs = relationship("GraphBuildJob", back_populates="graph", cascade="all, delete-orphan")


class KnowledgeGraphMember(Base):
    """用户与非内置图谱的访问权限。"""

    __tablename__ = "knowledge_graph_members"

    id = Column(Integer, primary_key=True, index=True)
    graph_id = Column(Integer, ForeignKey("knowledge_graphs.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    permission = Column(Enum(GraphPermission), default=GraphPermission.VIEWER, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    graph = relationship("KnowledgeGraph", back_populates="members")
    user = relationship("User")


class GraphBuildJob(Base):
    """文本建图任务；第一版使用 FastAPI BackgroundTasks，后续可平移到 Redis/Celery。"""

    __tablename__ = "graph_build_jobs"

    id = Column(Integer, primary_key=True, index=True)
    graph_id = Column(Integer, ForeignKey("knowledge_graphs.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(Enum(GraphBuildStatus), default=GraphBuildStatus.PENDING, nullable=False)
    progress = Column(Integer, default=0, nullable=False)
    current_stage = Column(String(80), nullable=True)
    source_file_name = Column(String(255), nullable=False)
    source_file_size = Column(Integer, default=0, nullable=False)
    source_path = Column(String(500), nullable=False)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    graph = relationship("KnowledgeGraph", back_populates="build_jobs")
    user = relationship("User")


def init_db():
    """
    初始化数据库表
    在应用启动时调用，创建所有表
    """
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ 数据库表初始化成功")
    except Exception as e:
        print(f"❌ 数据库表初始化失败: {e}")
        raise


def get_db():
    """
    获取数据库会话生成器
    用于依赖注入，确保数据库连接正确关闭
    
    Yields:
        Session: SQLAlchemy 数据库会话
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
