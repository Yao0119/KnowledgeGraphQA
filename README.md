# 基于知识图谱的恶意软件预测与问答系统

> 前后端分离的知识图谱应用：从病毒库数据构建**中英双语知识图谱**（Neo4j），
> 提供图谱可视化、**中英双层对照**、智能问答、推理、预测、病毒检测，以及完整的用户与权限管理。
> LLM 后端可切换（默认 DeepSeek 云端 API，可改本地 Ollama），**API Key 支持在页面上直接配置**。

**技术栈**：React 18 + Vite 5 + Ant Design 5 + vis-network 10 ｜ FastAPI + SQLAlchemy ｜ MySQL 8 + Neo4j 2025.x

---

## 目录

- [1. 功能一览](#1-功能一览)
- [2. 系统架构](#2-系统架构)
- [3. 目录结构](#3-目录结构)
- [4. 快速开始](#4-快速开始)
- [5. 配置速查](#5-配置速查)
- [6. 页面一览](#6-页面一览)
- [7. API 一览](#7-api-一览)
- [8. 知识图谱数据模型](#8-知识图谱数据模型)
- [9. 测试与调试脚本](#9-测试与调试脚本)
- [10. 常见问题](#10-常见问题)
- [11. 已知限制](#11-已知限制)
- [12. 变更记录](#12-变更记录)

---

## 1. 功能一览

| 模块 | 说明 |
| --- | --- |
| **用户系统** | MySQL 存储；注册 / 登录 / 个人资料；JWT 鉴权（`Authorization: Bearer`） |
| **双角色权限** | `admin`（管理员）与 `customer`（客户）；写图谱、客户管理、系统设置仅管理员 |
| **知识图谱可视化** | vis-network 渲染；按**病毒种子抽样**取子图；支持换一批、只看实体、滚轮缩放、拖拽平移、节点增删改 |
| **中英双层对照** | 左右两个独立图谱面板分别渲染中文层 / 英文层，两个核心节点隔线相对；点节点跨面板联动 + 中英属性并排对比 |
| **智能问答** | 两阶段图谱检索（实体字面命中 → 中文 n-gram 关键词兜底）+ LLM 生成；回答下方可展开图谱依据 |
| **系统推理** | LLM 结合图谱证据推理 |
| **威胁预测** | 后端已实现，前端页面为占位 |
| **病毒检测** | 后端为**模拟实现**（随机判定），非真实扫描 |
| **系统设置** | 页面上配置 LLM 后端 / API Key / 模型 / 基址；保存即生效并写入 `.env`；带连通性测试 |

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│  浏览器  React 18 + Vite 5 + antd 5 + vis-network 10         │
└───────────────┬─────────────────────────────────────────────┘
                │ 相对路径 /api/...（开发期由 Vite 反向代理转发）
                ▼
┌─────────────────────────────────────────────────────────────┐
│  后端  FastAPI (backend.main:app)                            │
│  ├── admin/      客户管理、系统统计、管理员资料（JWT / 静态令牌）│
│  ├── customer/   个人资料                                     │
│  ├── functions/  qa / reasoning / prediction / retrieval      │
│  └── utils/      neo4j_utils / llm 工厂 / health_check         │
└───┬──────────────┬──────────────┬───────────────────────────┘
    │              │              │
    ▼              ▼              ▼
 MySQL 8        Neo4j          LLM 后端
 用户与资料      知识图谱        DeepSeek 云端（默认）
                              / 本地 Ollama（可切换）
```

**端口与地址**

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| 后端 API | `http://127.0.0.1:8000` | 交互式文档 `/docs` |
| 前端 | `http://localhost:5173` | ⚠️ 见下方「前端地址」说明 |
| MySQL | `localhost:3306` | 库名 `kg_qa_system` |
| Neo4j Bolt | `bolt://localhost:7687` | Neo4j Browser `http://localhost:7474` |
| Ollama（可选） | `http://localhost:11434` | 仅 `LLM_PROVIDER=ollama` 时需要 |

> **前端地址为什么写 `localhost` 而不是 `127.0.0.1`**
> Vite 默认把开发服务器绑在 IPv6 回环 `[::1]` 上，此时 `127.0.0.1:5173` 连不上。
> 如果 `localhost` 打不开，改用 `http://[::1]:5173`，或在 `vite.config.mjs` 里给
> `server.host` 指定 `'127.0.0.1'` 后重启。

---

## 3. 目录结构

```
KnowledgeGraphQA/
├── backend/                          FastAPI 后端
│   ├── main.py                       应用入口：健康检查、图谱只读接口、登录注册、
│   │                                 中英双层接口、LLM 设置接口
│   ├── kg_manager.py                 /api/kg/*：统计、样本、节点增删改
│   ├── evaluation_module.py          评测模块
│   ├── core/                         核心模块
│   │   ├── config.py                 全部配置集中在此（每项可用同名环境变量覆盖）
│   │   ├── models.py                 SQLAlchemy ORM：User / CustomerProfile / UserRole
│   │   ├── database.py               数据库 CRUD；密码哈希（直接调用 bcrypt）
│   │   └── __init__.py               统一导出
│   ├── admin/
│   │   ├── routes.py                 客户管理、系统统计、管理员资料
│   │   └── auth.py                   JWT 签发与校验、require_admin 依赖
│   ├── customer/
│   │   └── routes.py                 个人资料读写
│   ├── functions/
│   │   ├── routes.py                 功能模块统一路由
│   │   ├── retrieval.py              两阶段图谱检索（实体命中 → 关键词兜底 + 邻居扩展）
│   │   ├── agent.py                  LLM + 图谱问答编排
│   │   ├── qa.py                     问答封装
│   │   ├── reasoning.py              推理（LLM + 证据）
│   │   └── prediction.py             威胁预测
│   ├── utils/
│   │   ├── neo4j_utils.py            图谱查询、统计、可视化抽样、双层对照
│   │   ├── llm.py                    LLM 客户端工厂（按 LLM_PROVIDER 选择）
│   │   ├── deepseek_llm.py           DeepSeek 客户端（默认后端）
│   │   ├── local_llm.py              Ollama 客户端
│   │   ├── settings_store.py         运行时 LLM 设置的读写与持久化（设置页用）
│   │   └── health_check.py           各外部服务的健康检查
│   └── requirements.txt
│
├── frontend/                         React + Vite
│   ├── src/
│   │   ├── api.js                    统一 API 层（baseURL / JWT / 错误信息提取）
│   │   ├── graphTheme.js             图谱配色、布局参数、节点载荷转换（两个图谱页共用）
│   │   ├── App.jsx                   路由表
│   │   ├── components/
│   │   │   ├── Sidebar.jsx           侧边栏导航
│   │   │   └── LLMSettingsModal.jsx  系统设置弹窗（配置 API Key）
│   │   └── pages/                    12 个页面
│   ├── scripts/test-api.js           接口连通性冒烟测试
│   ├── vite.config.mjs               含 /api 反向代理 + Tailwind v4 插件
│   └── package.json
│
├── test/                             测试与调试脚本
├── .env.example                      环境变量示例（复制为 .env）
├── start.bat                         Windows 一键启动
└── README.md                         本文档
```

---

## 4. 快速开始

### 4.1 前置清单

- [ ] Python 3.10+（本项目在 3.13 上验证）
- [ ] Node.js 18+（本项目在 22.19 上验证）
- [ ] MySQL 8.0+ 已启动
- [ ] Neo4j 5.x / 2025.x 已启动（`bolt://localhost:7687`）
- [ ] Ollama（**可选**；只有把 LLM 切到本地时才需要）

### 4.2 准备 MySQL

```bash
# 本地安装的 MySQL
mysql -uroot -p -e "CREATE DATABASE IF NOT EXISTS kg_qa_system CHARACTER SET utf8mb4;"

# 或者用 Docker
docker run -d --name kg_mysql -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=123456 \
  -e MYSQL_DATABASE=kg_qa_system \
  mysql:8.0
```

表结构**不需要手工创建**：后端启动时会自动 `init_db()`，并在检测不到管理员时自动创建 `admin / admin123`。

### 4.3 安装后端依赖

```bash
# 在仓库根目录执行
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # Windows；macOS/Linux 用 source .venv/bin/activate

pip install -r backend/requirements.txt

# 下载慢可用国内源
pip install -r backend/requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 4.4 安装前端依赖

```bash
cd frontend
npm install
```

> ⚠️ 不要只在仓库根目录 `npm install`。前端依赖必须装到 `frontend/node_modules`，
> 否则 Vite 会报 `Failed to resolve import "vis-network"`。

### 4.5 准备 Neo4j 与图谱数据

```bash
neo4j.bat console        # Windows
neo4j console            # macOS / Linux
```

图谱数据需**提前导入**（本仓库不含导入脚本）。图谱为空时接口仍正常返回，只是节点/关系数为 0，
前端会显示空图而不是报错。

连接参数在 `backend/core/config.py`，或用环境变量 `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` 覆盖。

> **关于 Neo4j 的监听地址**：Neo4j 默认只监听 `127.0.0.1`。本项目后端用 Bolt 直连，
> 不受影响；但如果你想把 Neo4j 暴露给容器/局域网，需要改
> `conf/neo4j.conf` 里的 `server.default_listen_address=0.0.0.0`。

### 4.6 配置 LLM（两种方式，任选其一）

**方式 A：在网页上配置（推荐，不用重启）**

用管理员登录 → 右上角**齿轮按钮**（或头像菜单里的「系统设置」）→ 填入 DeepSeek API Key →
点「测试连接」确认 → 点「保存并生效」。

保存会同时更新运行时配置并写入仓库根目录的 `.env`，**重启后依然有效**。密钥在界面上只显示掩码。

**方式 B：编辑 `.env`（启动前配置）**

```bash
copy .env.example .env        # Windows
# cp .env.example .env        # macOS / Linux
```

```env
DEEPSEEK_API_KEY=sk-你的密钥      # https://platform.deepseek.com/api_keys
DEEPSEEK_MODEL=deepseek-flash    # 对应 DeepSeek-V4.1-Flash
```

> **不填 Key 也能启动。** 问答 / 推理 / 预测会返回明确提示「未配置 DEEPSEEK_API_KEY」，
> `/api/health` 的 `llm_reason` 也会说明原因，不会抛异常、也不会让服务起不来。

**改用本地 Ollama**

```env
LLM_PROVIDER=ollama
OLLAMA_MODEL=qwen:1.8b
```

```bash
ollama pull qwen:1.8b
ollama serve
```

### 4.7 启动

> ### ⚠️ 后端必须在仓库根目录、以模块方式启动
>
> ```bash
> # ✅ 正确（在 KnowledgeGraphQA/ 根目录）
> python -m uvicorn backend.main:app --reload --port 8000
>
> # ❌ 错误
> cd backend && uvicorn main:app --reload --port 8000
> python backend/main.py
> ```
>
> 后两种写法缺少包上下文，`backend.core` / `backend.utils` 的相对导入会失败。
> `backend/main.py` 开头有显式检查，会直接打印启动指引并退出，
> 而不是抛出难以理解的 `ImportError`。

**方式一：分别启动（推荐，便于看日志）**

```bash
# 终端 1 —— 后端（仓库根目录）
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000

# 终端 2 —— 前端
cd frontend
npm run dev
```

期望输出：

```
✅ MySQL 数据库初始化成功
✅ 默认管理员账户已创建: admin/admin123                          （仅首次启动）
✅ LLM 客户端初始化成功: provider=deepseek, model=deepseek-flash  （已配置 Key 时）
INFO:     Uvicorn running on http://127.0.0.1:8000
```

若看到 `⚠️ LLM 客户端已创建但当前不可用: … 原因: 未配置 DEEPSEEK_API_KEY`，说明 Key 没配好，
但**服务仍会正常启动**。

**方式二：一键启动**

```bat
start.bat                      :: Windows（优先用 .venv，缺失则回退全局 python）
python test/start_server.py    :: 或这个 Python 脚本（同时拉起前后端）
```

### 4.8 验证

```bash
# 后端健康检查
curl http://127.0.0.1:8000/api/health

# 接口连通性冒烟（探测 /api/health、/api/kg/*、/api/graph/*、/api/qa/ask、管理员鉴权）
cd frontend && npm run test-api

# 端到端功能测试（用 TestClient 直连 app，不需先启动服务）
.\.venv\Scripts\python.exe test\test_complete_system.py
```

浏览器打开 `http://localhost:5173`，用下方账户登录。

**默认账户**

| 角色 | 用户名 | 密码 | 来源 |
| --- | --- | --- | --- |
| 管理员 | `admin` | `admin123` | 后端首次启动自动创建 |
| 客户 | 自定义 | 自定义 | 通过 `/register` 页面注册 |

---

## 5. 配置速查

全部配置集中在 `backend/core/config.py`，每项都可用**同名环境变量**覆盖；
根目录或 `backend/` 下的 `.env` 会在启动时自动加载（已存在的环境变量优先）。

| 配置 | 环境变量 | 默认值 |
| --- | --- | --- |
| LLM 后端 | `LLM_PROVIDER` | `deepseek`（可选 `ollama`） |
| DeepSeek 密钥 | `DEEPSEEK_API_KEY` | 空（**需自行配置**，或在系统设置页里填） |
| DeepSeek 模型 | `DEEPSEEK_MODEL` | `deepseek-flash`（= DeepSeek-V4.1-Flash） |
| DeepSeek 基址 | `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` |
| DeepSeek 思考模式 | `DEEPSEEK_THINKING` | `disabled`（服务端默认是 enabled） |
| JWT 密钥 | `SECRET_KEY` | 占位符 `change-this-secret-key`（**必须改**） |
| 管理员静态令牌 | `ADMIN_TOKEN` | 占位符 `CHANGE_ME_ADMIN_TOKEN`（**必须改**） |
| MySQL | `MYSQL_HOST/USER/PASSWORD/DATABASE/PORT` | localhost / root / **占位符 `CHANGE_ME_MYSQL_PASSWORD`** / kg_qa_system / 3306 |
| Neo4j | `NEO4J_URI/USER/PASSWORD` | bolt://localhost:7687 / neo4j / **占位符 `CHANGE_ME_NEO4J_PASSWORD`** |
| Ollama | `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | http://localhost:11434 / qwen:1.8b |
| CORS 白名单 | `CORS_ORIGINS` | http://localhost:5173,http://127.0.0.1:5173 |
| 图谱检索 | `KG_MAX_TERMS` / `KG_MAX_TRIPLES` / `KG_EXPAND_NEIGHBORS` | 32 / 25 / true |
| 通用生成参数 | `LLM_TEMPERATURE` / `LLM_MAX_TOKENS` | 0.3 / 1024 |

> ⚠️ **口令类配置不提供可用默认值。** `backend/core/config.py` 里放的是
> `CHANGE_ME_*` 占位符，真实值请写进仓库根目录的 `.env`（已被 `.gitignore` 忽略），
> 或用环境变量注入。启动时若仍是占位符，控制台会集中打印提醒。
> 这也是为什么**克隆下来后必须先建 `.env` 才能连上数据库**。

前端侧（`frontend/.env`）：

| 变量 | 用途 |
| --- | --- |
| `VITE_BACKEND` | 开发期 Vite 反向代理的目标（默认 `http://127.0.0.1:8000`） |
| `VITE_API_BASE` | 部署时前后端不同源才需要设置 |

---

## 6. 页面一览

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/login`、`/register` | 登录 / 注册 | |
| `/dashboard` | 系统概览 | 各外部服务状态卡片；默认重定向到 `/dashboard/graph` |
| `/dashboard/graph` | **知识图谱管理** | 图谱可视化 + 三元组样例 + 节点增删改 |
| `/dashboard/graph-dual` | **中英双层对照** | 左右两个图谱面板 + 跨面板联动 + 中英属性对比 |
| `/dashboard/qa` | 问答检索 | 提问、回答、可展开的图谱依据 |
| `/dashboard/reasoning` | 系统推理 | |
| `/dashboard/virus` | 病毒检测 | 后端为模拟实现 |
| `/dashboard/predict` | 预测 | 占位 |
| `/dashboard/customers` | 客户管理 | 仅管理员 |
| `/customer-profile`、`/admin-profile` | 个人资料 | |

**系统设置**：登录后点右上角**齿轮按钮**，或头像下拉菜单里的「系统设置」。
用于配置 LLM 后端 / API Key / 模型 / 基址，并提供「测试连接」（不消耗 token）。
**仅管理员可读写**，普通客户打开会看到「需要管理员权限」的提示。

### 图谱可视化的两个交互要点

1. **图上是抽样，不是全库。** 170 万节点无法一次画完，接口按「N 个病毒种子展开邻域」取子图。
   工具栏可调种子数（10/25/40/80）、点「换一批」翻页，页面顶部会明确写出当前显示量与全库总量的对比。
2. **「只看实体」开关**。`解决方案 / 病毒行为 / 综合描述` 这类节点的名字是整句中文（最长上百字），
   合计约占全部节点的 72%，放进图里会把布局撑得很宽。打开开关后只保留
   实体-关系-实体 结构，图更清爽（全文仍可在「节点对照」里看到）。

---

## 7. API 一览

运行中的服务提供始终最新的清单：<http://127.0.0.1:8000/docs>。

### 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 登录，返回 JWT |
| POST | `/api/auth/register` | 注册（客户角色） |

### 系统

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/` | API 信息 |
| GET | `/api/health` | 健康检查（`overall`: healthy / degraded / unhealthy） |

### 知识图谱（只读）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/graph/summary` | 节点数 / 关系数 |
| GET | `/api/graph/samples` | 样本三元组 |
| GET | `/api/graph/full` | 可视化子图。参数 `seeds`（种子数）、`offset`（换一批）、`hide_text`（只看实体）、`limit` |
| GET | `/api/graph/malware-list` | 中英两层都有的病毒列表（可对照），按关系数降序 |
| GET | `/api/graph/layers` | **中英双层子图**。参数 `virus`、`limit`；返回 `{virus, cn, en, core, matched}` |
| GET | `/api/graph/node-detail` | 按 `norm_name` 查同一实体的中英两版属性，供并排对比 |

### 知识图谱（写，需管理员）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/kg/stats` | 图谱统计 |
| GET | `/api/kg/sample` | 样本节点 |
| POST | `/api/kg/node` | 新建节点 |
| PUT | `/api/kg/node/{node_id}` | 更新节点名称 / 标签 |
| DELETE | `/api/kg/node/{node_id}` | 删除节点及其关系 |

### 功能

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/qa/ask` | 知识图谱问答 |
| POST | `/api/reasoning/reason` | LLM + 图谱推理 |
| POST | `/api/prediction/predict` | 威胁预测 |
| POST | `/api/virus-detection` | 病毒检测（**模拟实现**） |
| GET | `/api/functions/health` | 功能模块健康检查 |

### 管理员（需鉴权）

鉴权方式（按优先级）：`Authorization: Bearer <管理员JWT>` → `X-Admin-Token: <静态令牌>` →
`?admin_token=<静态令牌>`。实现见 `backend/admin/routes.py` 的 `require_admin`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/customers` | 客户列表 |
| GET | `/api/admin/customers/{user_id}` | 客户详情 |
| DELETE | `/api/admin/customers/{user_id}` | 删除客户 |
| PUT | `/api/admin/customers/{user_id}/update-profile` | 更新客户资料 |
| GET | `/api/admin/stats` | 系统统计 |
| GET / PUT | `/api/admin/profile` | 管理员资料 |
| POST | `/api/admin/change-password` | 修改管理员密码 |

### 客户（需 JWT）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET / PUT | `/api/customer/profile` | 个人资料（扁平 snake_case） |
| GET | `/api/customer/info` | 用户信息 + 资料 |

### 系统设置（需管理员）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/settings/llm` | 读取当前 LLM 设置（**密钥只返回掩码**） |
| PUT | `/api/settings/llm` | 更新设置：立即生效 + 写入 `.env` |
| POST | `/api/settings/llm/test` | 连通性探针（走 `GET /models`，不消耗 token） |

---

## 8. 知识图谱数据模型

### 8.1 总体结构：中英两层单语图，只有核心节点跨层相连

```
     中文图谱 (lang = "cn")                     英文图谱 (lang = "en")

   (Virus/MSExcel.Pri)  ←── 只有核心节点有 ALIGN_WITH ──→  (Virus/MSExcel.Pri)
        │ 病毒家族                                          │ Family
        ▼                                                   ▼
     (Pri)                                               (Pri)
        │ 运行环境                                          │ Platform
        ▼                                                   ▼
   (Excel 文档)                                        (MSExcel)
        │ 解决方案                                          │ Solution
        ▼                                                   ▼
   (更新杀软：…)                                       (Update software killing: …)
```

- 每个节点都有 `lang` 属性（`"cn"` / `"en"`），中英各一套节点
- **关系名就是源数据字段名**：中文层用中文，英文层用英文，两层一眼可辨
- **只有 `:Malware`（恶意软件本体）之间存在 `ALIGN_WITH` 映射** ——
  家族 / 平台 / 别名 / 文本节点都不跨层相连

中文层与英文层的对应关系靠节点的 `name_orig` 属性追溯（永远是源数据原值）。

### 8.2 节点标签

所有节点都带 `:Entity` 公共标签（作为统一约束 / 索引的载体），另加领域标签；
`:Malware` 节点还会带一个家族标签。

| 领域标签 | 数量 | 含义 |
| --- | --- | --- |
| `:Behavior` | 577,675 | 病毒行为（整句文本） |
| `:Solution` | 549,781 | 解决方案（整句文本） |
| `:Malware` | 257,247 | **恶意软件本体（核心节点）**，附家族标签 `Virus/Trojan/Worm/GrayWare/RiskWare/HackTool/TestFile/JunkFile` |
| `:Alias` | 152,523 | 其他厂商命名 |
| `:Description` | 103,387 | 综合描述 |
| `:Family` | 63,408 | 病毒家族 |
| `:CountValue` | 1,398 | 变种数量 |
| `:DateValue` | 470 | 首次发现时间 |
| `:Platform` | 208 | 运行环境 |
| `:Category` | 128 | 威胁行为分类 |
| `:MalwareType` | 16 | 威胁类型 |

合计 **1,706,241 个节点 / 2,437,714 条关系（22 种关系类型）**。

> ⚠️ 取节点类型时**不要用 `labels(n)[0]`**。标签返回顺序不保证，实测对
> `:Solution` / `:Family` / `:Platform` 等会返回公共标签 `Entity`，导致前端所有节点糊成一种类型。
> 后端 `node_display_type()` 已按「跳过 `Entity` → 家族标签 → 领域标签」的优先级处理；
> 节点载荷统一由 `node_payload()` 生成（`id / label / type / lang / name_orig / norm_name / is_core`）。

### 8.3 关系类型

| 中文层（`lang="cn"`） | 英文层（`lang="en"`） | 指向 |
| --- | --- | --- |
| `病毒家族` | `Family` | `:Family` |
| `运行环境` | `Platform` | `:Platform` |
| `其他厂商命名` | `Other vendor names` | `:Alias` |
| `威胁行为` | `Threat behavior` | `:Category` |
| `典型变种` | `Variants` | `:Malware` |
| `威胁类型` | `Virus type` | `:MalwareType` |
| `首次发现时间` | `First found` | `:DateValue` |
| `变种数量` | `Variants count` | `:CountValue` |
| `解决方案` | `Solution` | `:Solution` |
| `病毒行为` | `Virus behavior` | `:Behavior` |
| `综合描述` | `Description` | `:Description` |
| `ALIGN_WITH` | —— | 跨层，仅连核心节点（方向 `cn → en`，128,517 条） |

> 中文层 12 种关系、英文层 11 种 —— **少的那一种就是跨层的桥**。
> 中文关系名在 Cypher 里必须用反引号：`` MATCH (a)-[:`病毒家族`]->(b) ``。

### 8.4 中文层的实体名翻译

源数据的**实体标识符本身就是拉丁文**（病毒名 `Virus/MSExcel.Pri`、家族 `Pri`、
别名 `W97M/Ostrich.A`），中文只出现在 `解决方案` / `病毒行为` / `综合描述` 三段文本里。
所以中文层的「中文」来自三处：**关系名** + **文本节点内容** + **平台/类别的翻译**。

翻译表是独立可编辑的 JSON（`Knowledge_Grsph/i18n_zh.json`，位于图谱构建仓库）：

| 分类 | 取值总数 | 已译 | 保留原值 |
| --- | --- | --- | --- |
| `Category`（威胁行为） | 64 | 64 | 0 |
| `Platform`（运行环境） | 104 | 71 | 33 |

- 节点 `name`：中文层用中文名（`MSExcel` → `Excel 文档`、`Dialer` → `拨号器`）；英文层保持原值
- 节点 `name_orig`：永远是源数据原值，用于追溯两层的对应

### 8.5 常用查询示例

```cypher
// 图谱总量
MATCH (n) RETURN count(n);
MATCH ()-[r]->() RETURN count(r);

// 一个病毒在中文层的全部三元组
MATCH (a:Malware {lang:'cn', name:'Virus/MSExcel.Ostrich'})-[r]->(b)
RETURN type(r) AS 关系, left(b.name, 44) AS 宾语 ORDER BY 关系;

// ★ 中英双层对照：核心节点相连，左右各一套单语关系
MATCH (cn:Malware {lang:'cn'})-[:ALIGN_WITH]->(en:Malware {lang:'en'})
WHERE cn.name = 'Virus/MSExcel.Pri'
MATCH (cn)-[rc:`病毒家族`]->(fc:Family), (cn)-[rp:`运行环境`]->(pc:Platform)
MATCH (en)-[re:Family]->(fe:Family),     (en)-[rq:Platform]->(pe:Platform)
RETURN cn.name AS 中文层, type(rc) AS 中文关系1, fc.name AS 中文宾语1,
       type(rp) AS 中文关系2, pc.name AS 中文宾语2,
       en.name AS 英文层, type(re) AS 英文关系1, fe.name AS 英文宾语1,
       type(rq) AS 英文关系2, pe.name AS 英文宾语2;

// 统计关系规模
MATCH ()-[r]->() RETURN type(r) AS rel, count(*) AS cnt ORDER BY cnt DESC;
```

**注意**：中英两个源文件的病毒集合并不完全相同（各 51,802 / 51,805 条记录），
因此各有约 100 个病毒无法配对。

---

## 9. 测试与调试脚本

所有脚本都必须在**仓库根目录**下运行。脚本内部已做 `sys.path` 引导或把子进程 `cwd` 设为仓库根目录。

| 脚本 | 用途 | 需要后端已启动 |
| --- | --- | --- |
| `test/start_server.py` | 一键启动后端 + 前端 | 否（它负责启动） |
| `test/test_complete_system.py` | 端到端功能测试（登录/注册/客户列表/问答/推理/图谱/健康） | 否（TestClient 直连 app） |
| `test/test_full_api.py` | 打印管理员接口、问答、登录的完整响应，便于排错 | 否（TestClient） |
| `test/test_api_route.py` | 直接调用管理员路由函数，排查路由层问题 | 否（直连数据库） |
| `test/debug_db.py` | 查看 `users` / `customer_profiles` 表内容 | 否（直连数据库） |
| `test/test_system.py` | 对外部 HTTP 服务的集成测试 | **是** |
| `test/test_backend.py` | 检查 MySQL 连接与登录/客户列表接口 | **是** |
| `test/test_admin_api.py` | 检查管理员接口 | **是** |
| `test/verify_updates.py` | 结构巡检（模块位置、路由、配置项） | 否 |
| `frontend/scripts/test-api.js` | 前端到后端的连通性冒烟（`npm run test-api`） | **是** |

```powershell
# 端到端（推荐先跑这个）
.\.venv\Scripts\python.exe test\test_complete_system.py

# 结构巡检
.\.venv\Scripts\python.exe test\verify_updates.py

# 一键启动前后端
.\.venv\Scripts\python.exe test\start_server.py
```

> 未启动 MySQL / Neo4j / Ollama 时，相关用例会**明确报出失败原因**而不是静默通过 ——
> 这是有意为之（健康检查会返回 `degraded` / `unhealthy`）。
> 测试脚本里的管理员静态令牌统一**从 `backend/core/config.py` 读取**（它会加载 `.env`），
> 脚本里不再硬编码任何令牌；管理端页面用的是登录返回的 JWT，也不在浏览器里放令牌。

---

## 10. 常见问题

### Q1 启动后端报 `ImportError: attempted relative import with no known parent package`

在 `backend/` 目录里执行了 `uvicorn main:app`。回到仓库根目录，用
`python -m uvicorn backend.main:app` 启动。

### Q2 启动报 `UnicodeEncodeError: 'gbk' codec can't encode character`

Windows 控制台代码页是 GBK，而日志里有 ✅/⚠️ 等 emoji。
项目已在 `backend/core/config.py` 里把 stdout/stderr 切到 UTF-8 并加 `errors="replace"`，
正常不会再出现；若仍出现，执行 `chcp 65001`。

### Q3 登录一直 401

历史原因是 `passlib 1.7.4` 与 `bcrypt 5.x` 不兼容，会让哈希与校验直接抛异常。
现在 `backend/core/database.py` 改为**直接调用 bcrypt**，且与旧的 `$2b$` 哈希格式完全兼容，
**不需要**再手工往源码里粘贴哈希值。请确认按 `backend/requirements.txt` 重新安装了依赖。

### Q4 前端白屏 / 报 `Failed to resolve import "vis-network"`

前端依赖没装到 `frontend/` 下：

```bash
cd frontend && npm install && npm run dev
```

### Q5 图谱管理页能看不能改（写入 403）

写操作需要管理员身份，请用 `admin` 登录。客户账号仍可查看图谱，但不能增删改节点。

### Q6 图谱统计一直是 0

Neo4j 里没有数据，或连接参数不对。先用 Neo4j Browser（`http://localhost:7474`）确认能查到节点，
再检查 `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD`。

### Q7 问答 / 推理返回「未配置 DEEPSEEK_API_KEY」

两种办法：用 `admin` 登录后在**齿轮 → 系统设置**里填 Key 并保存（立即生效），
或把 Key 写进根目录 `.env` 后重启后端。两种方式都可以用
`curl http://127.0.0.1:8000/api/health` 确认：`llm` 应为 `connected`、`llm_reason` 为 `null`。

若测试连接返回 401 / 402 / 403，分别对应 **Key 无效 / 余额不足 / 无权访问该模型**；429 是限流，稍后重试。

### Q8 系统设置保存成功但问答仍提示未配置

先确认你是用**管理员**登录的（该接口仅管理员可写，普通客户会拿到 403）。
若确实是管理员，检查 `.env` 是否被其他环境变量覆盖 —— 启动时 `.env` 不会覆盖**已存在的环境变量**，
`GET /api/settings/llm` 返回的 `api_key_from_env` 字段会告诉你当前值是否来自环境变量。

### Q9 想改回本地 Ollama

```env
LLM_PROVIDER=ollama
OLLAMA_MODEL=qwen:1.8b
```

```bash
ollama serve
ollama list          # 确认模型已下载
ollama pull qwen:1.8b
```

### Q10 问答回答里看不到图谱依据

问答页每条回答下方会显示「图谱依据 N 条（检索策略）」，展开可看具体三元组。若显示 0 条：

1. 确认 Neo4j 里有数据（`/api/kg/stats` 的 nodes 不为 0）
2. 确认问题里的词与节点名有重合（检索优先做实体名字面匹配）
3. 在 Neo4j Browser 里核对节点名：`MATCH (n) RETURN n.name LIMIT 20`

### Q11 图谱页 / 对照页节点很多但看不清

用「只看实体」开关过滤整句文本节点，或把种子数降到 10，或直接用滚轮放大
（缩放以鼠标位置为中心，工具栏也提供了放大/缩小按钮）。

### Q12 前端 `localhost:5173` 打不开

见[第 2 节](#2-系统架构)的「前端地址」说明 —— Vite 默认只绑 IPv6 回环。
换 `http://[::1]:5173`，或在 `vite.config.mjs` 里把 `server.host` 设为 `'127.0.0.1'`。

### Q13 改了代码前端没变化

- 改 `frontend/src/**`：Vite 热更新，浏览器刷新即可
- 改 `vite.config.mjs` 或安装依赖：需要重启 `npm run dev`
- 改后端：`--reload` 会自动重启；若未开启，手动重启

### 停止服务

```bash
# Windows
taskkill /F /IM python.exe
taskkill /F /IM node.exe

# macOS / Linux
pkill -f "uvicorn backend.main:app"
pkill -f "npm run dev"
pkill ollama
```

---

## 11. 已知限制

| 项 | 说明 |
| --- | --- |
| **图谱无法一次全量展示** | 170 万节点 / 244 万关系，可视化只能抽样。接口按病毒种子展开邻域，页面会明确标注当前显示量与全库总量 |
| **图上不显示的文本节点** | `解决方案 / 病毒行为 / 综合描述` 合计约 72% 的节点，名字是整句中文。默认在图上隐藏（可开关），它们仍存在于图谱中，也可在「节点对照」里查看全文 |
| **中英对照依赖源数据** | 只有中英两层都存在的病毒才能对照；两个源文件的病毒集合相差约 100 条 |
| **中文层的翻译范围有限** | 只有 `Platform` / `Category` 两类实体名有中文翻译表；病毒名 / 家族 / 别名是拉丁标识符，源数据本身没有中文名 |
| **病毒检测是模拟实现** | 后端为随机判定，并非真实扫描 |
| **预测页未接入** | 后端 `/api/prediction/predict` 已实现，前端页面为占位 |
| **Node 版本提示** | 健康检查里可能出现「服务状态：异常」，那是 LLM 未配置导致的 `degraded`，不是后端故障 |
| **系统设置仅管理员** | API Key 属系统级配置，写接口复用了 `require_admin` |

---

## 12. 变更记录

### 2026-10（图谱与前端改造）

**图谱与后端**

- 修复 `node_display_type()`：原先取 `labels(n)[0]`，而新 schema 下每个节点都带公共标签
  `:Entity`，导致 `:Solution` / `:Family` / `:Platform` 等**全部显示成 "Entity"**，前端配色失效。
  改为按「跳过 `Entity` → 家族标签 → 领域标签」的优先级取类型
- 修复问答检索的实体名扫描：原实现用无序 `MATCH (n) ... LIMIT`，而句子型节点占全部节点的 72%，
  20,000 个名额几乎被整句中文和 `0` / `2025-08` 这类纯值占满。改为排除
  `Solution / Behavior / Description / DateValue / CountValue`
- 修复可视化抽样：`MATCH (n)-[r]->(m) LIMIT 200` 因为 `rels.csv` 按关系类型分组导入，
  只会取到同一种关系的边（实测 207 节点 / **1 种关系**，200 个孤立小星形）。
  改为**以病毒种子展开邻域**：25 个种子 → 443 节点 / 11 种关系
- 新增中英双层接口：`/api/graph/layers`、`/api/graph/malware-list`、`/api/graph/node-detail`
- 新增 LLM 运行时设置接口：`/api/settings/llm`（GET/PUT）与 `/api/settings/llm/test`，
  支持即时生效 + 写入 `.env` + 掩码返回 + 不消耗 token 的连通性探针
- 修复 `create_llm_client()` 的默认参数早绑定问题：`DeepSeekClient.__init__` 的
  `api_key=DEEPSEEK_API_KEY` 在 import 时就被固化成字符串快照，
  导致**设置页改了 Key 也不生效**。改为每次创建时从 config 现读
- `utils/neo4j_utils.py` 统一节点载荷 `node_payload()`，并新增 `get_layer_graph` /
  `get_dual_layer_graph` / `list_dual_malware` / `get_node_detail`

**前端**

- 新增**中英双层对照页** `/dashboard/graph-dual`：左右两个独立 vis-network 实例、
  层级方向相反（核心节点隔线相对）、跨面板按 `norm_name` 联动高亮、中英属性并排对比
- 新增**系统设置弹窗**：主页 header 齿轮按钮 + 头像菜单「系统设置」（原先点了只弹「功能开发中」）
- 新增 `src/graphTheme.js`：两个图谱页共用配色、布局参数与节点转换
- 图谱管理页新增「样本规模 / 换一批 / 只看实体」控件与抽样说明条；标签截断 + 宽度上限
- **修复滚轮缩放失效**：实测监听器与配置均正常、事件也到达了容器且调用了 `preventDefault`，
  但 vis-network 自带的缩放通路不起作用。改为显式接管滚轮（以鼠标位置为中心、限制 0.12–3.5 倍）
- 修复初始缩放被 `fit()` 压到 **0.099**（字号 15px 实际只有 1.5px，导致"放大放不大"的观感）：
  给自适应缩放设置 0.35 的可读下限
- 稳定结束后**自动关闭物理引擎**，避免节点持续抖动；补齐 vis-network effect 的 cleanup
  （原先没有 cleanup，每次换数据都会残留监听器与旧实例）

### 更早

- 修过头像下拉菜单响应、MySQL 连接池与 `utf8mb4`、Neo4j 驱动延迟初始化、
  全局错误处理中间件、`authenticate_user` 返回类型等（详见 git 历史）
- 整理过项目文档，删除了一批重复/临时 md

---

## 开发注意事项

1. **导入路径**：所有后端模块用 `backend.xxx` 形式导入，且必须从仓库根目录以模块方式启动
2. **认证**：客户端 API 通过 `Authorization: Bearer <JWT>` 传递令牌
3. **错误返回**：统一用 FastAPI 的 `HTTPException`
4. **配置**：新增配置项一律加到 `backend/core/config.py`，并用同名环境变量覆盖
5. **生产部署前必须修改**：`SECRET_KEY`、`ADMIN_TOKEN`、MySQL / Neo4j 口令，并收紧 `CORS_ORIGINS`
