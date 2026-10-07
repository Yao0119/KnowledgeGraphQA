#!/usr/bin/env python3
"""
测试后端 API 和数据库连接

用法（在仓库根目录）: python test/test_backend.py
"""

import pathlib
import subprocess  # noqa: F401
import sys
import time  # noqa: F401

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import requests


def check_mysql_connection():
    """检查 MySQL 连接"""
    print("\n=== 检查 MySQL 连接 ===")
    try:
        # 配置模块已重构：backend/config.py → backend/core/config.py
        from backend.core.config import MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE, MYSQL_PORT
        import pymysql
        
        conn = pymysql.connect(
            host=MYSQL_HOST,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=MYSQL_DATABASE,
            port=MYSQL_PORT
        )
        print(f"✅ MySQL 连接成功")
        print(f"   主机: {MYSQL_HOST}:{MYSQL_PORT}")
        print(f"   数据库: {MYSQL_DATABASE}")
        
        # 检查表
        cursor = conn.cursor()
        cursor.execute("SHOW TABLES;")
        tables = cursor.fetchall()
        print(f"   存在的表: {[t[0] for t in tables]}")
        
        # 表名是 users（复数），原来写的是 user，会直接报 1146 表不存在
        cursor.execute("SELECT COUNT(*) FROM users;")
        user_count = cursor.fetchone()[0]
        print(f"   用户数: {user_count}")
        
        cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'admin';")
        admin_count = cursor.fetchone()[0]
        print(f"   管理员数: {admin_count}")
        
        cursor.close()
        conn.close()
        return True
    except Exception as e:
        print(f"❌ MySQL 连接失败: {e}")
        print(f"   请确保 MySQL 服务已启动")
        return False


def check_backend_api():
    """检查后端 API"""
    print("\n=== 检查后端 API ===")
    try:
        # 检查登录端点
        response = requests.post(
            "http://127.0.0.1:8000/api/auth/login",
            json={"username": "admin", "password": "admin123"},
            timeout=5
        )
        
        if response.status_code == 200:
            print(f"✅ 登录 API 可用 (HTTP {response.status_code})")
            data = response.json()
            token = data.get("access_token")
            print(f"   获得 token: {token[:20]}...")
            
            # 检查客户列表端点
            # 令牌与后端同源（backend/core/config.py 会读取仓库根目录的 .env）。
            # 原先这里硬编码了后端当时的默认令牌，一旦默认值改动就会与后端不一致。
            from backend.core.config import ADMIN_TOKEN as admin_token
            response = requests.get(
                "http://127.0.0.1:8000/api/admin/customers",
                params={"admin_token": admin_token},
                timeout=5
            )
            
            if response.status_code == 200:
                print(f"✅ 客户列表 API 可用 (HTTP {response.status_code})")
                customers = response.json()
                print(f"   客户数: {len(customers)}")
            else:
                print(f"⚠️ 客户列表 API 返回 {response.status_code}")
                print(f"   响应: {response.text[:200]}")
        else:
            print(f"❌ 登录 API 错误 (HTTP {response.status_code})")
            print(f"   响应: {response.text[:200]}")
        
        return True
    except requests.exceptions.ConnectionError:
        print(f"❌ 无法连接到后端 API")
        print(f"   请确保后端服务正在 http://127.0.0.1:8000 运行")
        return False
    except Exception as e:
        print(f"❌ API 检查失败: {e}")
        return False


def main():
    print("=" * 50)
    print("知识图谱问答系统 - 后端检查")
    print("=" * 50)
    
    mysql_ok = check_mysql_connection()
    api_ok = check_backend_api()
    
    print("\n" + "=" * 50)
    print("检查结果总结：")
    print(f"  MySQL: {'✅' if mysql_ok else '❌'}")
    print(f"  API:   {'✅' if api_ok else '❌'}")
    print("=" * 50)
    
    if not mysql_ok or not api_ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
