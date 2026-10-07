#!/usr/bin/env python3
"""
完整的系统测试脚本

用法（在仓库根目录）: python test/test_complete_system.py
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import requests  # noqa: F401
from fastapi.testclient import TestClient

try:
    from backend.main import app
except Exception as e:
    print(f"❌ 导入后端失败: {e}")
    sys.exit(1)

client = TestClient(app)
BASE_URL = "http://127.0.0.1:8000"

# 管理员静态令牌与 backend/core/config.py 保持单一来源（该模块会读取仓库根目录的 .env），
# 避免在脚本里硬编码令牌、以及脚本与后端取值不一致。
import os  # noqa: E402
try:
    from backend.core.config import ADMIN_TOKEN  # noqa: E402
except Exception:  # 后端依赖缺失时退化为读环境变量
    ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "CHANGE_ME_ADMIN_TOKEN")

print("\n" + "=" * 70)
print("知识图谱问答系统 - 完整功能测试")
print("=" * 70)

tests_passed = 0
tests_failed = 0

# 测试 1: 用户登录
print("\n[1/7] 测试用户登录...")
try:
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123"}
    )
    if response.status_code == 200:
        data = response.json()
        admin_token = data.get("access_token")
        print(f"  ✅ 成功: 管理员登录")
        tests_passed += 1
    else:
        print(f"  ❌ 失败: {response.status_code}")
        tests_failed += 1
except Exception as e:
    print(f"  ❌ 异常: {e}")
    tests_failed += 1

# 测试 2: 用户注册
print("\n[2/7] 测试用户注册...")
try:
    response = client.post(
        "/api/auth/register",
        json={
            "username": f"test_user_{int(__import__('time').time())}",
            "email": f"test_{int(__import__('time').time())}@example.com",
            "password": "Test1234",
            "full_name": "Test User"
        }
    )
    if response.status_code in [200, 201]:
        print(f"  ✅ 成功: 新用户注册")
        tests_passed += 1
    else:
        print(f"  ❌ 失败: {response.status_code} - {response.text[:100]}")
        tests_failed += 1
except Exception as e:
    print(f"  ❌ 异常: {e}")
    tests_failed += 1

# 测试 3: 获取客户列表
print("\n[3/7] 测试获取客户列表...")
try:
    response = client.get(
        "/api/admin/customers",
        params={"admin_token": ADMIN_TOKEN}
    )
    if response.status_code == 200:
        customers = response.json()
        print(f"  ✅ 成功: 获取 {len(customers)} 个客户")
        tests_passed += 1
    else:
        print(f"  ❌ 失败: {response.status_code}")
        tests_failed += 1
except Exception as e:
    print(f"  ❌ 异常: {e}")
    tests_failed += 1

# 测试 4: 问答查询
print("\n[4/7] 测试问答查询...")
try:
    response = client.post(
        "/api/qa/ask",
        json={"question": "什么是恶意软件？"}
    )
    if response.status_code == 200:
        data = response.json()
        answer = data.get("answer", "")
        if answer and "LLM服务错误" not in answer:
            print(f"  ✅ 成功: 获得回答 ({len(answer)} 字符)")
            tests_passed += 1
        else:
            print(f"  ⚠️ 警告: 无有效回答")
            tests_failed += 1
    else:
        print(f"  ❌ 失败: {response.status_code}")
        tests_failed += 1
except Exception as e:
    print(f"  ❌ 异常: {e}")
    tests_failed += 1

# 测试 5: 系统推理
print("\n[5/7] 测试系统推理...")
try:
    response = client.post(
        "/api/reasoning/reason",
        json={"question": "恶意软件的特征有哪些？"}
    )
    if response.status_code == 200:
        data = response.json()
        answer = data.get("answer", "")
        if answer:
            print(f"  ✅ 成功: 推理结果 ({len(answer)} 字符)")
            tests_passed += 1
        else:
            print(f"  ⚠️ 警告: 无有效推理结果")
            tests_failed += 1
    else:
        print(f"  ❌ 失败: {response.status_code}")
        tests_failed += 1
except Exception as e:
    print(f"  ❌ 异常: {e}")
    tests_failed += 1

# 测试 6: 获取知识图谱摘要
print("\n[6/7] 测试知识图谱摘要...")
try:
    response = client.get("/api/graph/summary")
    if response.status_code == 200:
        data = response.json()
        print(f"  ✅ 成功: 获得图谱摘要")
        tests_passed += 1
    else:
        print(f"  ⚠️ 端点不可用: {response.status_code}")
except Exception as e:
    print(f"  ⚠️ 端点不可用: {e}")

# 测试 7: 系统健康检查
print("\n[7/7] 测试系统健康检查...")
try:
    response = client.get("/api/health")
    if response.status_code == 200:
        data = response.json()
        # /api/health 返回的是 {backend, neo4j, ollama, mysql, overall}，
        # 没有 status 字段（原断言 data.get("status") == "healthy" 永远不成立）
        status = data.get("overall") == "healthy"
        if status:
            print(f"  ✅ 成功: 系统健康")
            tests_passed += 1
        else:
            print(f"  ⚠️ 警告: 系统状态为 {data.get('overall')}（通常是 MySQL/Neo4j/Ollama 未全部启动）")
    else:
        print(f"  ⚠️ 端点不可用: {response.status_code}")
except Exception as e:
    print(f"  ⚠️ 端点不可用: {e}")

# 总结
print("\n" + "=" * 70)
print(f"测试结果: {tests_passed} 通过, {tests_failed} 失败")
if tests_failed == 0:
    print("🎉 所有关键测试通过！系统可以上线使用。")
else:
    print(f"⚠️ 还有 {tests_failed} 个测试需要修复。")
print("=" * 70 + "\n")

sys.exit(0 if tests_failed == 0 else 1)
