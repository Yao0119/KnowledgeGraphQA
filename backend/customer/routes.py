"""
客户路由模块
处理所有客户相关的API端点（个人资料、信息查询等）
"""

from fastapi import APIRouter, HTTPException, Depends, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from jose import jwt
from ..core import get_db, User, CustomerProfile, get_user_by_id, update_customer_profile
from ..core.config import SECRET_KEY, ALGORITHM

# ========================================
# 路由初始化
# ========================================
router = APIRouter(prefix="/api/customer", tags=["Customer"])


# ========================================
# Pydantic 请求/响应模型
# ========================================

class CustomerProfileUpdateRequest(BaseModel):
    """
    客户资料更新请求模型
    用于客户更新自己的个人信息
    """
    phone: Optional[str] = None
    address: Optional[str] = None
    company: Optional[str] = None
    department: Optional[str] = None
    full_name: Optional[str] = None


class CustomerProfileResponse(BaseModel):
    """
    客户资料响应模型
    返回客户的详细信息
    """
    id: int
    user_id: int
    phone: Optional[str] = None
    address: Optional[str] = None
    company: Optional[str] = None
    department: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    
    class Config:
        from_attributes = True


class CustomerInfoResponse(BaseModel):
    """
    客户完整信息响应模型
    包含用户和资料信息
    """
    user_id: int
    username: str
    email: str
    full_name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    company: Optional[str] = None
    department: Optional[str] = None
    created_at: Optional[str] = None


# ========================================
# 认证工具函数
# ========================================

async def get_current_customer(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> User:
    """
    从授权头获取当前客户用户
    
    Args:
        authorization: Authorization header (Bearer token)
        db: 数据库会话
        
    Returns:
        User: 当前登录的客户用户对象
        
    Raises:
        HTTPException: 如果令牌无效或用户不存在
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="缺少认证信息")
    
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="无效的认证方式")
        
        # 解码JWT令牌
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="无效的token")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="无效的token")
    except ValueError:
        raise HTTPException(status_code=401, detail="无效的token格式")
    
    # 查询用户
    from ..core.database import get_user_by_username
    user = get_user_by_username(db, username)
    if user is None:
        raise HTTPException(status_code=401, detail="用户不存在")
    
    return user


# ========================================
# API 端点
# ========================================

@router.get("/profile", response_model=CustomerProfileResponse)
async def get_customer_profile(
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db)
):
    """
    获取当前客户的详细资料
    
    Args:
        current_user: 当前登录的客户
        db: 数据库会话
        
    Returns:
        CustomerProfileResponse: 客户的详细资料
    """
    profile = db.query(CustomerProfile).filter(
        CustomerProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=404, detail="客户资料不存在")
    
    return profile


@router.put("/profile", response_model=dict)
async def update_customer_profile_route(
    data: CustomerProfileUpdateRequest,
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db)
):
    """
    更新当前客户的资料
    客户只能更新自己的信息
    
    Args:
        data: 要更新的资料信息
        current_user: 当前登录的客户
        db: 数据库会话
        
    Returns:
        dict: 更新结果消息
    """
    # 更新客户资料
    profile = update_customer_profile(
        db,
        current_user.id,
        phone=data.phone,
        address=data.address,
        company=data.company,
        department=data.department
    )
    
    # 更新用户的full_name
    if data.full_name:
        current_user.full_name = data.full_name
        db.commit()
    
    return {
        "message": "资料已更新",
        "profile": {
            "phone": profile.phone,
            "address": profile.address,
            "company": profile.company,
            "department": profile.department,
        }
    }


@router.get("/info", response_model=CustomerInfoResponse)
async def get_customer_info(
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db)
):
    """
    获取当前客户的完整信息
    包括用户基本信息和详细资料
    
    Args:
        current_user: 当前登录的客户
        db: 数据库会话
        
    Returns:
        CustomerInfoResponse: 客户的完整信息
    """
    profile = db.query(CustomerProfile).filter(
        CustomerProfile.user_id == current_user.id
    ).first()
    
    return {
        "user_id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "phone": profile.phone if profile else None,
        "address": profile.address if profile else None,
        "company": profile.company if profile else None,
        "department": profile.department if profile else None,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
    }
