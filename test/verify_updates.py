#!/usr/bin/env python3
"""
验证系统更新的脚本
检查：
1. 是否有残留的OpenAI代码
2. 本地LLM是否正确集成
3. 管理员/客户端路由是否正确

注意：脚本内所有路径都相对仓库根目录，因此这里先切到根目录，
保证 `python test/verify_updates.py` 与在根目录运行的行为一致。
（原来必须手动 cd 到根目录，否则所有路径检查都会失败；
且其中引用的 backend/local_llm.py、backend/config.py 等
都是重构前的旧路径，现已更新为包内路径。）
"""

import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)

def check_openai_references():
    """检查是否有OpenAI相关的代码"""
    print("\n🔍 检查 OpenAI 依赖...")
    
    patterns = [
        r'openai\.',
        r'from openai',
        r'import openai',
        r'OPENAI_API_KEY',
        r'gpt-4',
        r'ChatCompletion',
    ]
    
    backend_dir = Path("backend")
    found_issues = []
    
    for py_file in backend_dir.glob("**/*.py"):
        try:
            content = py_file.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            content = py_file.read_text(encoding='gbk')
        for pattern in patterns:
            if re.search(pattern, content, re.IGNORECASE):
                # 跳过注释和已处理的文件
                if not content.startswith("#"):
                    for line_num, line in enumerate(content.split('\n'), 1):
                        if re.search(pattern, line) and not line.strip().startswith('#'):
                            found_issues.append(f"{py_file}:{line_num} - {line.strip()}")
    
    if found_issues:
        print("❌ 发现 OpenAI 代码残留:")
        for issue in found_issues[:5]:  # 只显示前5个
            print(f"   {issue}")
        return False
    else:
        print("✅ 未发现 OpenAI 代码残留")
        return True


def check_local_llm_integration():
    """检查本地LLM是否正确集成"""
    print("\n🧠 检查本地 LLM 集成...")
    
    required_files = [
        "backend/utils/local_llm.py",
        "backend/functions/agent.py",
        "backend/functions/qa.py",
    ]
    
    all_exist = True
    for file in required_files:
        if os.path.exists(file):
            print(f"   ✅ {file}")
        else:
            print(f"   ❌ {file} 不存在")
            all_exist = False
    
    # 检查 local_llm.py 中的关键函数
    if os.path.exists("backend/utils/local_llm.py"):
        try:
            content = Path("backend/utils/local_llm.py").read_text(encoding='utf-8')
        except UnicodeDecodeError:
            content = Path("backend/utils/local_llm.py").read_text(encoding='gbk')
        if "get_llm_client" in content and "LocalLLMClient" in content:
            print("   ✅ LocalLLMClient 已定义")
        else:
            print("   ❌ LocalLLMClient 未定义")
            all_exist = False
    
    return all_exist


def check_admin_customer_routes():
    """检查管理员/客户端路由"""
    print("\n🛣️ 检查路由配置...")
    
    required_routes = [
        ("backend/main.py", "/api/auth/login"),
        ("backend/main.py", "/api/auth/register"),
        ("backend/admin/routes.py", "/api/admin/customers"),
        ("backend/customer/routes.py", "/api/customer/profile"),
    ]
    
    all_exist = True
    for file, route in required_routes:
        if os.path.exists(file):
            try:
                content = Path(file).read_text(encoding='utf-8')
            except UnicodeDecodeError:
                content = Path(file).read_text(encoding='gbk')
            if route in content or route.split('/')[-1] in content:
                print(f"   ✅ {route}")
            else:
                print(f"   ❌ {route} 未找到")
                all_exist = False
        else:
            print(f"   ❌ {file} 不存在")
            all_exist = False
    
    return all_exist


def check_frontend_pages():
    """检查前端页面"""
    print("\n🎨 检查前端页面...")
    
    required_pages = [
        "frontend/src/pages/Dashboard.jsx",
        "frontend/src/pages/Login.jsx",
        "frontend/src/pages/CustomerProfile.jsx",
        "frontend/src/pages/QA.jsx",
    ]
    
    all_exist = True
    for page in required_pages:
        if os.path.exists(page):
            print(f"   ✅ {page}")
        else:
            print(f"   ❌ {page} 不存在")
            all_exist = False
    
    # 检查 Login.jsx 中的注册链接
    if os.path.exists("frontend/src/pages/Login.jsx"):
        try:
            content = Path("frontend/src/pages/Login.jsx").read_text(encoding='utf-8')
        except UnicodeDecodeError:
            content = Path("frontend/src/pages/Login.jsx").read_text(encoding='gbk')
        if "/register" in content:
            print("   ✅ Login.jsx 中有注册链接")
        else:
            print("   ❌ Login.jsx 中没有注册链接")
            all_exist = False
    
    # 检查 Dashboard.jsx 中的管理员界面
    if os.path.exists("frontend/src/pages/Dashboard.jsx"):
        try:
            content = Path("frontend/src/pages/Dashboard.jsx").read_text(encoding='utf-8')
        except UnicodeDecodeError:
            content = Path("frontend/src/pages/Dashboard.jsx").read_text(encoding='gbk')
        if "AdminDashboard" in content and "api/admin/customers" in content:
            print("   ✅ Dashboard.jsx 中有管理员管理界面")
        else:
            print("   ❌ Dashboard.jsx 中缺少管理员界面")
            all_exist = False
    
    return all_exist


def check_config():
    """检查配置文件"""
    print("\n⚙️ 检查配置...")
    
    if os.path.exists("backend/core/config.py"):
        try:
            content = Path("backend/core/config.py").read_text(encoding='utf-8')
        except UnicodeDecodeError:
            content = Path("backend/core/config.py").read_text(encoding='gbk')
        checks = [
            ("OLLAMA_BASE_URL", "OLLAMA_BASE_URL"),
            ("OLLAMA_MODEL", "OLLAMA_MODEL"),
        ]
        
        for check_name, check_str in checks:
            if check_str in content:
                print(f"   ✅ {check_name} 已配置")
            else:
                print(f"   ❌ {check_name} 未配置")
    
    return True


def main():
    print("=" * 60)
    print("🔧 知识图谱问答系统 - 更新验证")
    print("=" * 60)
    
    results = {
        "OpenAI 清理": check_openai_references(),
        "本地 LLM 集成": check_local_llm_integration(),
        "路由配置": check_admin_customer_routes(),
        "前端页面": check_frontend_pages(),
        "配置文件": check_config(),
    }
    
    print("\n" + "=" * 60)
    print("📊 验证结果总结")
    print("=" * 60)
    
    for check_name, result in results.items():
        status = "✅ 通过" if result else "⚠️ 警告"
        print(f"{status}: {check_name}")
    
    all_passed = all(results.values())
    
    print("\n" + "=" * 60)
    if all_passed:
        print("✨ 所有检查通过！系统已准备就绪。")
        print("\n🚀 启动步骤:")
        print("1. 启动 MySQL 数据库")
        print("2. 启动 Neo4j")
        print("3. 启动 Ollama: ollama serve")
        print("   拉取模型: ollama pull qwen:7b")
        print("4. 启动后端: cd backend && python -m uvicorn main:app --reload")
        print("5. 启动前端: cd frontend && npm run dev")
        print("\n🔑 默认管理员账号: admin / admin123")
    else:
        print("⚠️ 存在检查失败项，请查看上面的详细信息。")
    
    print("=" * 60)


if __name__ == "__main__":
    main()
