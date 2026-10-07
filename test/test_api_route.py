#!/usr/bin/env python3
"""
直接测试 API 路由

用法（在仓库根目录）: python test/test_api_route.py
"""

import asyncio
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

# 模块已重构：backend/admin_routes.py → backend/admin/routes.py
from backend.admin.routes import get_all_customers_list
from backend.core import get_db

async def test_api():
    print("=== 测试 API 路由 ===\n")
    
    try:
        db = next(get_db())
        print("✅ 数据库连接成功\n")
        
        # 测试 get_all_customers_list
        # 注意：该函数现在通过 require_admin 依赖鉴权，直接调用时传 current_admin=None
        # 即代表"已通过静态令牌校验"，与 ?admin_token=... 的效果一致。
        print("调用 get_all_customers_list...")
        result = await get_all_customers_list(
            current_admin=None,
            skip=0,
            limit=100,
            db=db
        )
        
        print(f"✅ 返回 {len(result)} 个客户:")
        for customer in result:
            print(f"  - {customer['username']} ({customer['email']})")
        
        db.close()
        
    except Exception as e:
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_api())
