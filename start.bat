@echo off
REM 知识图谱问答系统 - Windows一键启动脚本
REM 该脚本会启动后端、前端和可选的LLM服务

setlocal enabledelayedexpansion

echo ================================================
echo 知识图谱问答系统 - 启动脚本
echo ================================================
echo.

REM 检查Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python未安装或未添加到PATH
    echo 请先安装Python 3.8+ 并添加到环境变量
    pause
    exit /b 1
)

REM 检查Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js未安装或未添加到PATH
    echo 请先安装Node.js 16+ 并添加到环境变量
    pause
    exit /b 1
)

REM 设置管理员Token
REM [已移除] 管理员静态令牌不再在此设置，统一由根目录 .env 提供
set OLLAMA_BASE_URL=http://localhost:11434
REM [已移除] LLM_MODEL_NAME 不是有效配置项（应为 OLLAMA_MODEL / DEEPSEEK_MODEL）

echo [INFO] 启动后端服务...
REM 必须在仓库根目录以模块方式启动：进入 backend/ 再执行 uvicorn main:app
REM 会丢失包上下文，backend.core / backend.utils 的相对导入会失败。
REM 优先使用 .venv（若不存在则回退到全局 python）。
if exist ".venv\Scripts\python.exe" (
    start "KG_Backend" cmd /k ".venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000"
) else (
    start "KG_Backend" cmd /k "python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000"
)
timeout /t 3

echo [INFO] 启动前端服务...
start "KG_Frontend" cmd /k "cd frontend && npm run dev"
timeout /t 3

echo.
echo ================================================
echo ✅ 服务启动完成！
echo ================================================
echo.
echo 📍 服务地址:
echo   后端 API:  http://localhost:8000
echo   后端文档:  http://localhost:8000/docs
echo   前端应用:  http://localhost:5173
echo   LLM服务:   http://localhost:11434 (需要手动启动Ollama)
echo.
echo 📝 接下来的步骤:
echo   1. 等待所有服务启动（约5-10秒）
echo   2. 打开浏览器访问 http://localhost:5173
echo   3. 注册新账户或使用admin账户登录
echo.
echo 💡 可选：启动LLM服务
echo   在新的PowerShell/CMD中运行:
echo   ollama serve
echo.
echo ⚠️  要停止所有服务，关闭这些窗口即可
echo.
pause
