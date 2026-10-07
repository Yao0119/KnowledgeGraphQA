"""
admin 模块初始化文件
导出管理员路由和相关函数
"""

from .routes import router as admin_router

# 导出
__all__ = [
    "admin_router",
]
