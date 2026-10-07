"""
管理员路由模块
处理所有管理员相关的API端点（客户管理、系统统计等）

鉴权说明（本版本改造）：
原实现只接受 `?admin_token=...` 这一个静态令牌，且前端必须把这个令牌硬编码进
浏览器代码里 —— 令牌会出现在 URL、浏览器历史和服务器访问日志中。
现在统一为一个依赖 `require_admin`，按优先级接受：
    1. Authorization: Bearer <JWT>   ← 管理员用 /api/auth/login 登录后拿到的令牌
    2. X-Admin-Token: <静态令牌>
    3. ?admin_token=<静态令牌>       ← 兼容旧前端与 test/ 下的脚本
"""

from fastapi import APIRouter, HTTPException, Depends, Header, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional
from jose import jwt, JWTError

from ..core import get_db, User, UserRole, CustomerProfile
from ..core import get_all_customers, delete_user, get_user_by_id, update_customer_profile
from ..core.database import get_user_by_username, get_user_by_email, hash_password, verify_password
from ..core.config import SECRET_KEY, ALGORITHM, ADMIN_TOKEN


# ========================================
# 路由初始化
# ========================================
router = APIRouter(prefix="/api/admin", tags=["Admin"])

# 静态令牌统一从 backend/core/config.py 读取（默认值为占位符，真实值放 .env）。
# 之前这里自带一份 `os.getenv("ADMIN_TOKEN", <硬编码默认值>)`，
# 与 config 里的配置项重复，而且会把真实令牌写进源码，已合并为单一来源。


# ========================================
# 鉴权依赖
# ========================================

def require_admin(
    admin_token: Optional[str] = Query(
        None, description="兼容旧调用方式的静态管理员令牌"
    ),
    authorization: Optional[str] = Header(
        None, description="Bearer <管理员登录返回的 JWT>"
    ),
    x_admin_token: Optional[str] = Header(
        None, alias="X-Admin-Token", description="静态管理员令牌（独立请求头）"
    ),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    管理员鉴权依赖

    按顺序尝试 JWT → X-Admin-Token → admin_token 查询参数，任一通过即放行。

    Args:
        admin_token: URL 查询参数形式的静态令牌（旧方式，保留兼容）
        authorization: Authorization 请求头，形如 "Bearer <JWT>"
        x_admin_token: X-Admin-Token 请求头形式的静态令牌
        db: 数据库会话（JWT 方式需要查用户并校验角色）

    Returns:
        Optional[User]: 通过 JWT 登录的管理员用户对象；
                        通过静态令牌时返回 None（调用方不应依赖该返回值）

    Raises:
        HTTPException: 三种方式都未通过时返回 403
    """
    # ---- 方式 1：JWT（可校验角色，最安全）----
    if authorization:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            username = None
            try:
                payload = jwt.decode(parts[1], SECRET_KEY, algorithms=[ALGORITHM])
                username = payload.get("sub")
            except JWTError:
                username = None
            if username:
                user = get_user_by_username(db, username)
                if user is not None and user.role == UserRole.ADMIN:
                    return user

    # ---- 方式 2 / 3：静态令牌 ----
    if x_admin_token and x_admin_token == ADMIN_TOKEN:
        return None
    if admin_token and admin_token == ADMIN_TOKEN:
        return None

    raise HTTPException(
        status_code=403,
        detail="权限不足：请提供管理员 JWT（Authorization: Bearer）或有效的 admin_token",
    )


# ========================================
# Pydantic 请求/响应模型
# ========================================

class CustomerInfoResponse(BaseModel):
    """
    客户信息响应模型
    用于返回客户详细信息
    """
    id: int
    username: str
    email: str
    full_name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    company: Optional[str] = None
    department: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class UpdateCustomerRequest(BaseModel):
    """
    更新客户信息请求模型
    """
    phone: Optional[str] = None
    address: Optional[str] = None
    company: Optional[str] = None
    department: Optional[str] = None


class AdminProfileUpdateRequest(BaseModel):
    """
    管理员更新自己资料请求模型
    """
    email: Optional[str] = Field(None, max_length=100)
    full_name: Optional[str] = Field(None, max_length=100)


class PasswordChangeRequest(BaseModel):
    """
    修改密码请求模型
    """
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=6, max_length=128)


# ========================================
# API 端点
# ========================================

@router.get("/customers", response_model=list[CustomerInfoResponse])
async def get_all_customers_list(
    current_admin: Optional[User] = Depends(require_admin),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    获取所有客户列表（仅管理员）

    Args:
        current_admin: 鉴权依赖注入的管理员
        skip: 分页偏移量
        limit: 分页限制
        db: 数据库会话

    Returns:
        list: 客户信息列表
    """
    customers = get_all_customers(db, skip=skip, limit=limit)
    result = []

    for user in customers:
        profile = db.query(CustomerProfile).filter(
            CustomerProfile.user_id == user.id
        ).first()

        result.append({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "phone": profile.phone if profile else None,
            "address": profile.address if profile else None,
            "company": profile.company if profile else None,
            "department": profile.department if profile else None,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        })

    return result


@router.delete("/customers/{user_id}")
async def delete_customer(
    user_id: int,
    current_admin: Optional[User] = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    删除客户账户（仅管理员）

    Args:
        user_id: 要删除的客户ID
        current_admin: 鉴权依赖注入的管理员
        db: 数据库会话

    Returns:
        dict: 删除结果
    """
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if user.role != UserRole.CUSTOMER:
        raise HTTPException(status_code=400, detail="只能删除客户账户")

    # 防止管理员误删自己
    if current_admin is not None and current_admin.id == user_id:
        raise HTTPException(status_code=400, detail="不能删除当前登录的管理员账户")

    if delete_user(db, user_id):
        return {"message": "客户已删除"}
    else:
        raise HTTPException(status_code=500, detail="删除失败")


@router.get("/customers/{user_id}", response_model=CustomerInfoResponse)
async def get_customer_detail(
    user_id: int,
    current_admin: Optional[User] = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    获取特定客户的详细信息（仅管理员）

    Args:
        user_id: 客户ID
        current_admin: 鉴权依赖注入的管理员
        db: 数据库会话

    Returns:
        CustomerInfoResponse: 客户详情
    """
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if user.role != UserRole.CUSTOMER:
        raise HTTPException(status_code=400, detail="只能查看客户信息")

    profile = db.query(CustomerProfile).filter(
        CustomerProfile.user_id == user.id
    ).first()

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "phone": profile.phone if profile else None,
        "address": profile.address if profile else None,
        "company": profile.company if profile else None,
        "department": profile.department if profile else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.put("/customers/{user_id}/update-profile")
async def admin_update_customer(
    user_id: int,
    data: UpdateCustomerRequest,
    current_admin: Optional[User] = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    管理员更新客户信息

    Args:
        user_id: 客户ID
        data: 要更新的信息
        current_admin: 鉴权依赖注入的管理员
        db: 数据库会话

    Returns:
        dict: 更新结果
    """
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if user.role != UserRole.CUSTOMER:
        raise HTTPException(status_code=400, detail="只能更新客户信息")

    profile = update_customer_profile(
        db,
        user_id,
        phone=data.phone,
        address=data.address,
        company=data.company,
        department=data.department
    )

    return {
        "message": "客户信息已更新",
        "profile": {
            "user_id": profile.user_id,
            "phone": profile.phone,
            "address": profile.address,
            "company": profile.company,
            "department": profile.department,
        },
    }


@router.get("/stats")
async def get_admin_stats(
    current_admin: Optional[User] = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    获取系统统计信息（仅管理员）

    Args:
        current_admin: 鉴权依赖注入的管理员
        db: 数据库会话

    Returns:
        dict: 系统统计数据
    """
    total_customers = db.query(User).filter(
        User.role == UserRole.CUSTOMER
    ).count()

    total_admins = db.query(User).filter(
        User.role == UserRole.ADMIN
    ).count()

    total_users = db.query(User).count()

    return {
        "total_customers": total_customers,
        "total_admins": total_admins,
        "total_users": total_users
    }


@router.get("/profile")
async def get_admin_profile(
    current_admin: Optional[User] = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    获取当前管理员的个人资料

    Args:
        current_admin: 鉴权依赖注入的管理员
        db: 数据库会话

    Returns:
        dict: 管理员资料（使用静态令牌鉴权时没有具体用户，返回令牌身份）
    """
    if current_admin is None:
        return {
            "id": None,
            "username": "admin-token",
            "email": None,
            "full_name": None,
            "role": UserRole.ADMIN.value,
            "auth": "static-token",
            "created_at": None,
        }

    return {
        "id": current_admin.id,
        "username": current_admin.username,
        "email": current_admin.email,
        "full_name": current_admin.full_name,
        "role": current_admin.role.value,
        "auth": "jwt",
        "created_at": current_admin.created_at.isoformat() if current_admin.created_at else None,
    }


@router.put("/profile")
async def update_admin_profile(
    data: AdminProfileUpdateRequest,
    current_admin: Optional[User] = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    更新当前管理员自己的资料（邮箱、姓名）

    使用静态令牌鉴权时无法确定具体是哪个管理员，因此会拒绝该请求。

    Args:
        data: 要更新的字段
        current_admin: 鉴权依赖注入的管理员
        db: 数据库会话

    Returns:
        dict: 更新结果

    Raises:
        HTTPException: 静态令牌方式（无法确定用户）时返回 400
    """
    if current_admin is None:
        raise HTTPException(
            status_code=400,
            detail="使用静态 admin_token 时无法修改个人资料，请用管理员账号登录后重试",
        )

    if data.email and data.email != current_admin.email:
        existing = get_user_by_email(db, data.email)
        if existing is not None and existing.id != current_admin.id:
            raise HTTPException(status_code=400, detail="该邮箱已被其他账户使用")
        current_admin.email = data.email

    if data.full_name:
        current_admin.full_name = data.full_name

    db.commit()
    db.refresh(current_admin)

    return {
        "message": "管理员资料已更新",
        "profile": {
            "id": current_admin.id,
            "username": current_admin.username,
            "email": current_admin.email,
            "full_name": current_admin.full_name,
            "role": current_admin.role.value,
        },
    }


@router.post("/change-password")
async def change_admin_password(
    data: PasswordChangeRequest,
    current_admin: Optional[User] = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    修改当前管理员的登录密码

    前端 AdminProfile 页面上原本有一个"修改密码"表单，但它既没有 onFinish、
    输入框也没有 name，属于纯装饰 —— 这个接口是配套补齐的真实实现。

    Args:
        data: 当前密码与新密码
        current_admin: 鉴权依赖注入的管理员
        db: 数据库会话

    Returns:
        dict: 修改结果

    Raises:
        HTTPException: 静态令牌方式或当前密码错误时返回 400
    """
    if current_admin is None:
        raise HTTPException(
            status_code=400,
            detail="使用静态 admin_token 时无法修改密码，请用管理员账号登录后重试",
        )

    if not verify_password(data.current_password, current_admin.hashed_password):
        raise HTTPException(status_code=400, detail="当前密码不正确")

    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="新密码不能与当前密码相同")

    current_admin.hashed_password = hash_password(data.new_password)
    db.commit()

    return {"message": "密码已修改，请重新登录"}
