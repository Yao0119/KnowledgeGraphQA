# 知识图谱安全分析 · 微信小程序

这是 KnowledgeGraphQA 的原生微信小程序入口，已接入 `https://www.lighthe.site` 的 FastAPI 后端。

## 当前页面

- 首页：图谱概览、功能入口、最近问答
- 图谱：实体搜索、类型筛选、抽样邻域视觉、节点详情
- 问答：本地 mock 问答、会话记录、可展开三元组依据
- 我的：当前工作空间、语言层、后端状态和本地记录管理

## 打开方式

用微信开发者工具导入本目录：

D:\E\Graph_system\KnowledgeGraphQA\smallproject

## 接入方式

当前 app.js 已配置：

1. `globalData.apiBase = "https://www.lighthe.site"`
2. `globalData.useMock = false`
3. `utils/api.js` 的 `USE_MOCK = false`

域名已经配置 HTTPS。请在微信公众平台的“开发管理 → 开发设置 → 服务器域名”中，把 `https://www.lighthe.site` 加入 request 合法域名、uploadFile 合法域名。

在微信开发者工具中，如果尚未同步平台域名配置，可以临时勾选“不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”。正式发布前必须去掉该选项并完成平台域名配置。

## 登录

在“我的 → 服务连接”中登录。登录成功后 JWT 会保存在本地，用于：

- GET /api/graphs
- POST /api/graphs/build
- GET /api/admin/customers

病毒检测上传接口为公开接口，选择文件后即可扫描，不要求先登录；服务端仍限制文件大小并通过内部 ClamAV 扫描。

已接入的接口：

- GET /api/graph/summary
- GET /api/graph/full
- GET /api/graph/samples
- GET /api/graph/layers
- GET /api/graph/malware-list
- POST /api/qa/ask
- POST /api/prediction/predict
- POST /api/auth/login
- POST /api/virus-detection/upload（无需登录）

## 当前服务器限制

服务器只有 3.6 GB 内存。ClamAV 通过 `1.2 GB` 内存上限和每日一次病毒库检查运行，病毒库目录已持久化，并关闭了自动重启和冗余数据库重载。由于 ClamAV 常驻内存较高，后续如果要提高并发或扫描大文件，仍建议升级服务器内存。

当前 mock 数据与接口响应结构都集中在 utils/api.js，联调时不需要修改页面组件。
