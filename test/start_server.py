#!/usr/bin/env python3
"""
快速启动脚本 - 后端和前端双启动

修复记录：原实现用 os.path.dirname(__file__)（即 test/ 目录）去拼 "backend/main.py"，
实际会去找 test/backend/main.py —— 该路径永远不存在，脚本因此总是走 return False 的
早退分支，什么都不会启动。而且 cwd 被设为 test/，就算绕过检查，
`uvicorn backend.main:app` 也会因为没有包上下文而导入失败。
"""

import os
import subprocess
import sys
import time
from pathlib import Path

# test/ 的上一级就是仓库根目录
ROOT = Path(__file__).resolve().parents[1]


def main():
    print("=" * 70)
    print("知识图谱问答系统 - 一键启动")
    print("=" * 70)
    print(f"仓库根目录: {ROOT}\n")

    backend_main = ROOT / "backend" / "main.py"
    frontend_pkg = ROOT / "frontend" / "package.json"

    if not backend_main.exists():
        print(f"❌ 错误: 找不到后端文件 {backend_main}")
        return False

    if not frontend_pkg.exists():
        print(f"❌ 错误: 找不到前端文件 {frontend_pkg}")
        return False

    print("📦 启动后端服务...")
    print("   命令: python -m uvicorn backend.main:app --reload --port 8000")

    # 关键：cwd 必须是仓库根目录，`backend` 才在 sys.path 上
    backend_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app", "--reload", "--port", "8000"],
        cwd=str(ROOT),
    )

    time.sleep(5)

    try:
        import requests

        response = requests.get("http://127.0.0.1:8000/api/health", timeout=3)
        if response.status_code == 200:
            print("   ✅ 后端启动成功 (http://127.0.0.1:8000)")
        else:
            print(f"   ⚠️ 后端返回 {response.status_code}，可能仍在启动中")
    except Exception as exc:
        print(f"   ⚠️ 后端启动中或未就绪: {exc}")

    print("\n📦 启动前端开发服务器...")
    print("   命令: npm run dev  (cwd=frontend/)")

    # Windows 上 npm 是 .cmd，需要 shell=True
    frontend_process = subprocess.Popen(
        "npm run dev",
        cwd=str(ROOT / "frontend"),
        shell=os.name == "nt",
    )

    print("\n" + "=" * 70)
    print("✅ 启动流程完成")
    print("=" * 70)
    print("\n📱 访问地址:")
    print("   前端: http://localhost:5173")
    print("   后端: http://127.0.0.1:8000")
    print("   接口文档: http://127.0.0.1:8000/docs")
    print("\n🔐 默认凭证（首次启动自动创建）:")
    print("   用户名: admin")
    print("   密码:   admin123")
    print("\n按 Ctrl+C 停止所有服务\n")

    try:
        backend_process.wait()
    except KeyboardInterrupt:
        print("\n🛑 正在停止服务...")
        for proc in (backend_process, frontend_process):
            proc.terminate()
        time.sleep(2)
        for proc in (backend_process, frontend_process):
            if proc.poll() is None:
                proc.kill()
        print("✅ 服务已停止")

    return True


if __name__ == "__main__":
    main()
