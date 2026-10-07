#!/usr/bin/env python3
"""
系统集成测试脚本
用于验证后端各个模块是否正常工作
"""

import requests
import json
import sys
import os
import pathlib
from time import sleep

# 管理员静态令牌与 backend/core/config.py 保持单一来源（该模块会读取仓库根目录的 .env），
# 避免在脚本里硬编码令牌、以及脚本与后端取值不一致。
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
try:
    from backend.core.config import ADMIN_TOKEN
except Exception:  # 后端依赖缺失时退化为读环境变量
    ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "CHANGE_ME_ADMIN_TOKEN")


class TestRunner:
    def __init__(self, base_url="http://127.0.0.1:8000"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.admin_token = ADMIN_TOKEN
        self.passed = 0
        self.failed = 0
        
    def print_header(self, title):
        print(f"\n{'='*60}")
        print(f"  {title}")
        print(f"{'='*60}")
    
    def test(self, name, func):
        """运行一个测试"""
        try:
            print(f"\n[TEST] {name}...", end=" ")
            func()
            print("✅ PASSED")
            self.passed += 1
        except AssertionError as e:
            print(f"❌ FAILED: {e}")
            self.failed += 1
        except Exception as e:
            print(f"❌ ERROR: {e}")
            self.failed += 1
    
    def test_health_check(self):
        """测试健康检查"""
        resp = requests.get(f"{self.base_url}/api/health", timeout=5)
        assert resp.status_code == 200, f"Health check failed: {resp.status_code}"
        data = resp.json()
        # /api/health 返回 {backend, neo4j, ollama, mysql, overall}，没有 status 字段
        assert data.get("overall") in ("healthy", "degraded", "unhealthy"), f"Invalid health payload: {data}"
        print(f"(overall: {data.get('overall')}, Neo4j: {data.get('neo4j')}, MySQL: {data.get('mysql')})", end="")
    
    def test_system_info(self):
        """测试系统信息（根路径 / 返回应用信息；/api/info 从未实现）"""
        resp = requests.get(f"{self.base_url}/", timeout=5)
        assert resp.status_code == 200, f"Root info failed: {resp.status_code}"
        data = resp.json()
        assert "endpoints" in data, f"Invalid info: {data}"
        print(f"(Version: {data.get('version')})", end="")
    
    def test_register(self):
        """测试用户注册"""
        payload = {
            "username": "testuser",
            "email": "testuser@example.com",
            "password": "testpass123",
            "full_name": "Test User"
        }
        resp = requests.post(f"{self.base_url}/api/auth/register", json=payload, timeout=10)
        assert resp.status_code in [200, 201], f"Register failed: {resp.status_code} - {resp.text}"
        data = resp.json()
        assert "access_token" in data, f"No token in response: {data}"
        self.token = data["access_token"]
        self.user_id = data["user"]["id"]
        print(f"(User ID: {self.user_id})", end="")
    
    def test_login(self):
        """测试用户登录"""
        payload = {
            "username": "testuser",
            "password": "testpass123"
        }
        resp = requests.post(f"{self.base_url}/api/auth/login", json=payload, timeout=10)
        assert resp.status_code == 200, f"Login failed: {resp.status_code}"
        data = resp.json()
        assert "access_token" in data, f"No token in response"
        self.token = data["access_token"]
        print(f"(Token acquired)", end="")
    
    def test_get_customer_info(self):
        """测试获取客户信息"""
        headers = {"Authorization": f"Bearer {self.token}"}
        resp = requests.get(f"{self.base_url}/api/customer/info", headers=headers, timeout=5)
        assert resp.status_code == 200, f"Get info failed: {resp.status_code}"
        data = resp.json()
        assert "user" in data, f"No user in response"
        assert "profile" in data, f"No profile in response"
        print(f"(Username: {data['user']['username']})", end="")
    
    def test_update_profile(self):
        """测试更新个人资料"""
        headers = {"Authorization": f"Bearer {self.token}"}
        payload = {
            "phone": "13800138000",
            "address": "Beijing, China",
            "company": "Test Company",
            "department": "R&D"
        }
        resp = requests.put(f"{self.base_url}/api/customer/profile", json=payload, headers=headers, timeout=5)
        assert resp.status_code == 200, f"Update failed: {resp.status_code}"
        print(f"(Profile updated)", end="")
    
    def test_get_all_customers(self):
        """测试获取所有客户"""
        params = {"admin_token": self.admin_token}
        resp = requests.get(f"{self.base_url}/api/admin/customers", params=params, timeout=5)
        assert resp.status_code == 200, f"Get customers failed: {resp.status_code}"
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"(Total customers: {len(data)})", end="")
    
    def test_get_customer_detail(self):
        """测试获取客户详情"""
        params = {"admin_token": self.admin_token}
        resp = requests.get(f"{self.base_url}/api/admin/customers/{self.user_id}", params=params, timeout=5)
        assert resp.status_code == 200, f"Get customer detail failed: {resp.status_code}"
        data = resp.json()
        assert data.get("id") == self.user_id, f"User ID mismatch"
        print(f"(Customer: {data.get('username')})", end="")
    
    def test_get_admin_stats(self):
        """测试获取管理员统计"""
        params = {"admin_token": self.admin_token}
        resp = requests.get(f"{self.base_url}/api/admin/stats", params=params, timeout=5)
        assert resp.status_code == 200, f"Get stats failed: {resp.status_code}"
        data = resp.json()
        assert "total_customers" in data, f"No stats in response"
        print(f"(Customers: {data.get('total_customers')})", end="")
    
    def test_graph_stats(self):
        """测试获取图谱统计"""
        resp = requests.get(f"{self.base_url}/api/kg/stats", timeout=5)
        assert resp.status_code == 200, f"Graph stats failed: {resp.status_code}"
        data = resp.json()
        assert "nodes" in data, f"No stats in response"
        print(f"(Nodes: {data.get('nodes')})", end="")
    
    def test_qa(self):
        """测试问答功能"""
        payload = {"question": "什么是人工智能？"}
        resp = requests.post(f"{self.base_url}/api/qa/ask", json=payload, timeout=15)
        assert resp.status_code == 200, f"QA failed: {resp.status_code}"
        data = resp.json()
        assert "answer" in data, f"No answer in response"
        print(f"(Answer length: {len(data.get('answer', ''))})", end="")
    
    def run_all_tests(self):
        """运行所有测试"""
        self.print_header("知识图谱问答系统 - 集成测试")
        
        print("\n[INFO] 等待服务就绪...")
        sleep(2)
        
        # 健康检查
        self.print_header("1. 服务健康检查")
        self.test("健康检查", self.test_health_check)
        self.test("系统信息", self.test_system_info)
        
        # 认证测试
        self.print_header("2. 用户认证测试")
        self.test("用户注册", self.test_register)
        self.test("用户登录", self.test_login)
        
        # 客户API测试
        self.print_header("3. 客户API测试")
        self.test("获取客户信息", self.test_get_customer_info)
        self.test("更新个人资料", self.test_update_profile)
        
        # 管理员API测试
        self.print_header("4. 管理员API测试")
        self.test("获取所有客户", self.test_get_all_customers)
        self.test("获取客户详情", self.test_get_customer_detail)
        self.test("获取管理员统计", self.test_get_admin_stats)
        
        # 知识图谱测试
        self.print_header("5. 知识图谱测试")
        self.test("获取图谱统计", self.test_graph_stats)
        
        # 问答测试
        self.print_header("6. 问答功能测试")
        self.test("提交问题", self.test_qa)
        
        # 总结
        self.print_header("测试总结")
        total = self.passed + self.failed
        print(f"\n✅ 通过: {self.passed}")
        print(f"❌ 失败: {self.failed}")
        print(f"📊 总计: {total}")
        
        if self.failed == 0:
            print(f"\n🎉 所有测试通过！系统正常运行。")
            return 0
        else:
            print(f"\n⚠️  有{self.failed}个测试失败，请检查服务状态。")
            return 1


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="知识图谱问答系统测试")
    parser.add_argument("--host", default="127.0.0.1", help="后端主机地址")
    parser.add_argument("--port", default=8000, help="后端端口")
    
    args = parser.parse_args()
    base_url = f"http://{args.host}:{args.port}"
    
    runner = TestRunner(base_url)
    exit_code = runner.run_all_tests()
    sys.exit(exit_code)
