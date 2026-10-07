#!/usr/bin/env python3
"""
测试客户管理 API
"""

import os
import pathlib
import sys

import requests
import json

BASE_URL = "http://127.0.0.1:8000"

# 管理员静态令牌与 backend/core/config.py 保持单一来源（该模块会读取仓库根目录的 .env），
# 避免在脚本里硬编码令牌、以及脚本与后端取值不一致。
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
try:
    from backend.core.config import ADMIN_TOKEN
except Exception:  # 后端依赖缺失时退化为读环境变量
    ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "CHANGE_ME_ADMIN_TOKEN")

print("=== 测试客户管理 API ===\n")

# 测试 1: 获取客户列表
print("1️⃣ 获取客户列表...")
try:
    response = requests.get(
        f"{BASE_URL}/api/admin/customers",
        params={"admin_token": ADMIN_TOKEN},
        timeout=10
    )
    print(f"   状态码: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ 成功: {len(data)} 个客户")
        for customer in data:
            print(f"      - {customer['username']} ({customer['email']})")
    else:
        print(f"   ❌ 错误: {response.text[:100]}")
except Exception as e:
    print(f"   ❌ 异常: {e}")

# 测试 2: 获取系统统计
print("\n2️⃣ 获取系统统计...")
try:
    response = requests.get(
        f"{BASE_URL}/api/admin/stats",
        params={"admin_token": ADMIN_TOKEN},
        timeout=10
    )
    print(f"   状态码: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ 成功:")
        print(f"      - 总用户数: {data.get('total_users')}")
        print(f"      - 管理员数: {data.get('total_admins')}")
        print(f"      - 客户数: {data.get('total_customers')}")
    else:
        print(f"   ❌ 错误: {response.text[:100]}")
except Exception as e:
    print(f"   ❌ 异常: {e}")

print("\n✅ API 测试完成")
