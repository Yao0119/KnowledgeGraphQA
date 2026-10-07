#!/usr/bin/env python3
"""
直接测试数据库查询

用法（在仓库根目录）: python test/debug_db.py
"""

import pathlib
import sys

# 让 `backend` 可导入：本脚本位于 test/，其上一级才是仓库根目录。
# 直接用 `python test/debug_db.py` 时 sys.path[0] 是 test/，不加上这行会 ImportError。
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

# 模块已重构到包内：backend/models.py → backend/core/models.py
from backend.core.models import User, UserRole, CustomerProfile
from backend.core import get_db
from backend.core.database import get_all_customers

print("=== 数据库查询测试 ===\n")

try:
    db = next(get_db())
    print("✅ 数据库连接成功\n")
    
    # 尝试查询所有用户
    print("查询所有用户...")
    all_users = db.query(User).all()
    print(f"  总用户数: {len(all_users)}")
    for user in all_users:
        print(f"    - {user.username} ({user.role})")
    
    # 尝试查询所有客户
    print("\n查询所有客户...")
    customers = db.query(User).filter(User.role == UserRole.CUSTOMER).all()
    print(f"  客户数: {len(customers)}")
    for customer in customers:
        print(f"    - {customer.username}")
        
        # 查询对应的个人资料
        profile = db.query(CustomerProfile).filter(
            CustomerProfile.user_id == customer.id
        ).first()
        if profile:
            print(f"      资料: {profile.phone}, {profile.company}")
        else:
            print(f"      资料: 无")
    
    # 尝试使用 get_all_customers 函数
    print("\n使用 get_all_customers 函数...")
    try:
        result = get_all_customers(db)
        print(f"  结果: {len(result)} 个客户")
    except Exception as e:
        print(f"  ❌ 错误: {e}")
        import traceback
        traceback.print_exc()
    
    db.close()
    print("\n✅ 测试完成")

except Exception as e:
    print(f"❌ 错误: {e}")
    import traceback
    traceback.print_exc()
