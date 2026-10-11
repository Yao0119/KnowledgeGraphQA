# 知识图谱安全分析 · 微信小程序

这是 KnowledgeGraphQA 的原生微信小程序入口，当前为前端 MVP，后端服务器暂未接入。

## 当前页面

- 首页：图谱概览、功能入口、最近问答
- 图谱：实体搜索、类型筛选、抽样邻域视觉、节点详情
- 问答：本地 mock 问答、会话记录、可展开三元组依据
- 我的：当前工作空间、语言层、后端状态和本地记录管理

## 打开方式

用微信开发者工具导入本目录：

D:\E\Graph_system\KnowledgeGraphQA\smallproject

## 接入后端

编辑 utils/api.js 和 app.js：

1. 将 utils/api.js 顶部的 USE_MOCK 改为 false。
2. 将 app.js 的 globalData.useMock 改为 false。
3. 将 globalData.apiBase 改为后端地址，例如 https://example.com。
4. 在微信公众平台配置合法 request 域名。

已预留的接口路径与现有后端保持一致：

- GET /api/graph/summary
- GET /api/graph/full
- POST /api/qa/ask

当前 mock 数据与接口响应结构都集中在 utils/api.js，联调时不需要修改页面组件。
