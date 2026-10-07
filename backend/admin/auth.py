"""
管理员认证模块
处理JWT令牌生成和用户认证
"""

from datetime import datetime, timedelta
from jose import jwt, JWTError
from fastapi import HTTPException, Depends
from sqlalchemy.orm import Session
from ..core import User, get_db
from ..core.database import get_user_by_username, verify_password
from ..core.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES


# ========================================
# JWT 令牌管理
# ========================================

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    """
    创建JWT访问令牌
    
    Args:
        data: 要编码的数据字典，应包含'sub'键（用户标识）
        expires_delta: 令牌过期时间差，如果为None使用默认值
        
    Returns:
        str: 编码后的JWT令牌
        
    Example:
        >>> token = create_access_token({"sub": "username"})
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


# ========================================
# 用户认证
# ========================================

def authenticate_user(db: Session, username: str, password: str):
    """
    认证用户
    验证用户名和密码是否正确
    
    Args:
        db: 数据库会话
        username: 用户名
        password: 密码
        
    Returns:
        User: 认证成功返回用户对象，否则返回None
    """
    user = get_user_by_username(db, username)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


async def get_current_user(
    token: str,
    db: Session = Depends(get_db)
) -> User:
    """
    从JWT令牌获取当前用户
    用作路由依赖进行用户认证
    
    Args:
        token: JWT令牌字符串
        db: 数据库会话
        
    Returns:
        User: 当前用户对象
        
    Raises:
        HTTPException: 令牌无效或用户不存在时抛出401错误
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="无效的令牌")
    except JWTError:
        raise HTTPException(status_code=401, detail="无效的令牌")
    
    user = get_user_by_username(db, username)
    if user is None:
        raise HTTPException(status_code=401, detail="用户不存在")
    
    return user
