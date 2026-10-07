"""
核心模块
包含配置、数据库模型、数据库操作等核心功能
"""

from .config import (
    SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    DATABASE_URL,
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
)

from .models import (
    User,
    UserRole,
    CustomerProfile,
    init_db,
    get_db,
)

from .database import (
    hash_password,
    verify_password,
    get_user_by_username,
    get_user_by_email,
    get_user_by_id,
    create_user,
    delete_user,
    create_customer_profile,
    update_customer_profile,
    get_all_customers,
)

__all__ = [
    # Config
    "SECRET_KEY",
    "ALGORITHM",
    "ACCESS_TOKEN_EXPIRE_MINUTES",
    "DATABASE_URL",
    "OLLAMA_BASE_URL",
    "OLLAMA_MODEL",
    # Models
    "User",
    "UserRole",
    "CustomerProfile",
    "init_db",
    "get_db",
    # Database
    "hash_password",
    "verify_password",
    "get_user_by_username",
    "get_user_by_email",
    "get_user_by_id",
    "create_user",
    "delete_user",
    "create_customer_profile",
    "update_customer_profile",
    "get_all_customers",
]
