"""
数据库操作模块
提供所有数据库交互的业务逻辑函数
"""

from sqlalchemy.orm import Session
import bcrypt
from .models import User, CustomerProfile, UserRole
from datetime import datetime

# ========================================
# 密码加密配置
# ========================================
# 直接使用 bcrypt，不再经过 passlib。
# 原因：passlib 1.7.4（2020 年后停止维护）在初始化时会用 73 字节的密码做自检，
# 而 bcrypt>=5 对超过 72 字节的输入改为直接抛 ValueError（不再静默截断），
# 于是 pwd_context.hash() 在任何新装环境下都会失败 —— 注册/登录/自动建管理员全挂。
# bcrypt 的 $2b$ 哈希格式与 passlib 完全一致，历史数据无需迁移。
_BCRYPT_MAX_BYTES = 72


def _password_bytes(password) -> bytes:
    """
    把密码规整为 bcrypt 可接受的前 72 字节。

    bcrypt 算法本身只使用前 72 字节；bcrypt>=5 对超长输入直接报错，
    这里显式按字节截断，保证 hash 与 verify 行为一致，且超长密码不会变成 500。

    Args:
        password: 明文密码（str 或 bytes）

    Returns:
        bytes: 截断到 72 字节的 UTF-8 字节串
    """
    data = password if isinstance(password, bytes) else str(password).encode("utf-8")
    return data[:_BCRYPT_MAX_BYTES]


# ========================================
# 密码相关函数
# ========================================

def hash_password(password: str) -> str:
    """
    加密密码

    Args:
        password: 原始密码

    Returns:
        str: 加密后的密码哈希值（bcrypt $2b$ 格式）
    """
    return bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证密码是否匹配

    Args:
        plain_password: 原始密码
        hashed_password: 存储的哈希值

    Returns:
        bool: 密码是否匹配（哈希为空或格式非法时返回 False，不抛异常）
    """
    if not hashed_password:
        return False
    try:
        return bcrypt.checkpw(
            _password_bytes(plain_password),
            hashed_password.encode("utf-8"),
        )
    except (ValueError, TypeError):
        # 哈希格式非法（例如历史脏数据）时视为验证失败，避免登录接口 500
        return False


# ========================================
# 用户查询函数
# ========================================

def get_user_by_username(db: Session, username: str):
    """
    通过用户名查询用户
    
    Args:
        db: 数据库会话
        username: 用户名
        
    Returns:
        User: 用户对象或 None
    """
    return db.query(User).filter(User.username == username).first()


def get_user_by_email(db: Session, email: str):
    """
    通过邮箱查询用户
    
    Args:
        db: 数据库会话
        email: 邮箱地址
        
    Returns:
        User: 用户对象或 None
    """
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: Session, user_id: int):
    """
    通过ID查询用户
    
    Args:
        db: 数据库会话
        user_id: 用户ID
        
    Returns:
        User: 用户对象或 None
    """
    return db.query(User).filter(User.id == user_id).first()


# ========================================
# 用户创建和修改函数
# ========================================

def create_user(db: Session, username: str, email: str, password: str, full_name: str = None, role: UserRole = UserRole.CUSTOMER):
    """
    创建新用户
    
    Args:
        db: 数据库会话
        username: 用户名
        email: 邮箱
        password: 密码
        full_name: 全名（可选）
        role: 用户角色（默认为客户）
        
    Returns:
        User: 创建的用户对象
    """
    user = User(
        username=username,
        email=email,
        hashed_password=hash_password(password),
        full_name=full_name or username,
        role=role
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: int):
    """
    删除用户
    
    Args:
        db: 数据库会话
        user_id: 用户ID
        
    Returns:
        bool: 删除是否成功
    """
    user = get_user_by_id(db, user_id)
    if user:
        db.delete(user)
        db.commit()
        return True
    return False


# ========================================
# 客户资料函数
# ========================================

def create_customer_profile(db: Session, user_id: int, phone: str = None, address: str = None, 
                           company: str = None, department: str = None):
    """
    创建客户资料
    
    Args:
        db: 数据库会话
        user_id: 用户ID
        phone: 电话（可选）
        address: 地址（可选）
        company: 公司（可选）
        department: 部门（可选）
        
    Returns:
        CustomerProfile: 创建的资料对象
    """
    profile = CustomerProfile(
        user_id=user_id,
        phone=phone,
        address=address,
        company=company,
        department=department
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def update_customer_profile(db: Session, user_id: int, **kwargs):
    """
    更新客户资料
    
    Args:
        db: 数据库会话
        user_id: 用户ID
        **kwargs: 要更新的字段及其值
        
    Returns:
        CustomerProfile: 更新后的资料对象
    """
    profile = db.query(CustomerProfile).filter(CustomerProfile.user_id == user_id).first()
    if not profile:
        return create_customer_profile(db, user_id, **kwargs)
    
    for key, value in kwargs.items():
        if hasattr(profile, key) and value is not None:
            setattr(profile, key, value)
    
    profile.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(profile)
    return profile


# ========================================
# 客户列表查询函数
# ========================================

def get_all_customers(db: Session, skip: int = 0, limit: int = 100):
    """
    获取所有客户列表（分页）
    
    Args:
        db: 数据库会话
        skip: 跳过的记录数（分页）
        limit: 限制返回的记录数
        
    Returns:
        list: 客户用户对象列表
    """
    return db.query(User).filter(User.role == UserRole.CUSTOMER).offset(skip).limit(limit).all()
