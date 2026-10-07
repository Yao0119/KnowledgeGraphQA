#!/usr/bin/env python3
"""
测试后端 API 并捕获完整的错误信息

用法（在仓库根目录）: python test/test_full_api.py
"""

import pathlib
import sys
import traceback

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi import FastAPI  # noqa: F401  (保留原导入)
from fastapi.testclient import TestClient

# 导入后端应用
try:
    from backend.main import app
    print("✅ 后端应用导入成功\n")
except Exception as e:
    print(f"❌ 导入失败: {e}")
    traceback.print_exc()
    sys.exit(1)

# 管理员静态令牌与 backend/core/config.py 保持单一来源（该模块会读取仓库根目录的 .env），
# 避免在脚本里硬编码令牌、以及脚本与后端取值不一致。
try:
    from backend.core.config import ADMIN_TOKEN
except Exception:  # 后端依赖缺失时退化为读环境变量
    import os
    ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "CHANGE_ME_ADMIN_TOKEN")

# 创建测试客户端
client = TestClient(app)

print("=" * 60)
print("测试管理员 API")
print("=" * 60)

# 测试获取客户列表
print("\n1️⃣ 测试 GET /api/admin/customers")
print("-" * 60)
try:
    response = client.get(
        "/api/admin/customers",
        params={"admin_token": ADMIN_TOKEN}
    )
    print(f"状态码: {response.status_code}")
    print(f"响应: {response.json()}")
except Exception as e:
    print(f"❌ 错误: {e}")
    traceback.print_exc()

# 测试问答 API
print("\n2️⃣ 测试 POST /api/qa/ask")
print("-" * 60)
try:
    response = client.post(
        "/api/qa/ask",
        json={"question": "什么是恶意软件？"}
    )
    print(f"状态码: {response.status_code}")
    result = response.json()
    print(f"回答: {result.get('answer', 'N/A')[:100]}...")
except Exception as e:
    print(f"❌ 错误: {e}")
    traceback.print_exc()

# 测试登录 API
print("\n3️⃣ 测试 POST /api/auth/login")
print("-" * 60)
try:
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123"}
    )
    print(f"状态码: {response.status_code}")
    result = response.json()
    if response.status_code == 200:
        print(f"✅ 登录成功")
        print(f"   用户: {result.get('user', {}).get('username')}")
        print(f"   Token: {result.get('access_token', '')[:30]}...")
    else:
        print(f"❌ 登录失败: {result}")
except Exception as e:
    print(f"❌ 错误: {e}")
    traceback.print_exc()

print("\n" + "=" * 60)
print("测试完成")
print("=" * 60)
