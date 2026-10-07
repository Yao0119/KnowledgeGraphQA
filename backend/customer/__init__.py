"""
customer 模块初始化文件
导出客户路由和相关函数
"""

from .routes import router as customer_router

# 导出
__all__ = [
    "customer_router",
]
