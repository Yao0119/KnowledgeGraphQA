/**
 * 后端连通性冒烟测试（npm run test-api）
 *
 * 修复记录：原脚本第一项检查的是 /api/health/status —— 这个路径不存在
 * （真实路径是 /api/health），失败后直接 return，导致后面的检查永远不会执行，
 * 脚本因此**不可能通过**。另外 /api/user/profile/* 也从未实现过。
 *
 * 用法（需先启动后端）：
 *     npm run test-api
 * 可用环境变量 BACKEND 覆盖后端地址：
 *     set BACKEND=http://127.0.0.1:8000 && npm run test-api
 *
 * 注意：frontend/package.json 没有 "type": "module"，所以 .js 文件按 CommonJS 解析。
 * 原脚本写的是 `import axios from "axios"`，在这个目录下根本无法解析，
 * `npm run test-api` 会直接抛 SyntaxError。这里改用 require。
 */

const axios = require("axios");

const base = process.env.BACKEND || "http://127.0.0.1:8000";

const client = axios.create({ baseURL: base, timeout: 15000 });

/** 执行一次 GET 检查 */
async function checkGet(name, path) {
  try {
    const res = await client.get(path);
    const preview = JSON.stringify(res.data);
    console.log(`✅ ${name} 正常: ${preview.slice(0, 120)}${preview.length > 120 ? "..." : ""}`);
    return true;
  } catch (e) {
    const detail = e.response ? `HTTP ${e.response.status}` : e.message;
    console.log(`❌ ${name} 异常: ${detail}`);
    return false;
  }
}

async function testAPI() {
  console.log("🧩 开始检测后端环境...\n");
  console.log(`后端地址: ${base}\n`);

  const results = {};

  // 1. 健康检查（原脚本写错的路径就是这一项）
  results.backend = await checkGet("后端服务 /api/health", "/api/health");
  if (!results.backend) {
    console.log("\n⚠️ 后端未启动或地址不对，后续检查跳过。");
    console.log("   启动命令（在仓库根目录）: python -m uvicorn backend.main:app --reload --port 8000");
    process.exitCode = 1;
    return;
  }

  // 2. 知识图谱模块（kg_manager 路由现已挂载）
  results.kgStats = await checkGet("知识图谱统计 /api/kg/stats", "/api/kg/stats");
  results.kgSample = await checkGet("知识图谱样本 /api/kg/sample?limit=2", "/api/kg/sample?limit=2");

  // 3. 图谱可视化数据
  results.graphSummary = await checkGet("图谱摘要 /api/graph/summary", "/api/graph/summary");

  // 4. 问答模块（依赖 Ollama，可能不可用，单独标注）
  try {
    const r = await client.post("/api/qa/ask", { question: "你好" });
    const answer = r.data?.answer ?? "";
    console.log(`✅ 问答模块响应: ${String(answer).slice(0, 60)}...`);
    results.qa = true;
  } catch (e) {
    const detail = e.response ? `HTTP ${e.response.status}` : e.message;
    console.log(`❌ 问答模块异常: ${detail}`);
    results.qa = false;
  }

  // 5. 管理员鉴权（预期 403，因为没带令牌；403 说明鉴权逻辑生效）
  try {
    await client.get("/api/admin/stats");
    console.log("⚠️ 管理员接口未鉴权即可访问，请检查 require_admin");
    results.adminAuth = false;
  } catch (e) {
    if (e.response?.status === 403) {
      console.log("✅ 管理员接口鉴权生效（未带令牌返回 403）");
      results.adminAuth = true;
    } else {
      console.log(`❌ 管理员接口返回异常: ${e.response ? `HTTP ${e.response.status}` : e.message}`);
      results.adminAuth = false;
    }
  }

  console.log("\n🎯 检测结果汇总:");
  console.log(`- 后端服务:     ${results.backend ? "✅" : "❌"}`);
  console.log(`- 图谱统计:     ${results.kgStats ? "✅" : "❌"}`);
  console.log(`- 图谱样本:     ${results.kgSample ? "✅" : "❌"}`);
  console.log(`- 图谱摘要:     ${results.graphSummary ? "✅" : "❌"}`);
  console.log(`- 问答接口:     ${results.qa ? "✅" : "❌（通常是 Ollama 未启动）"}`);
  console.log(`- 管理员鉴权:   ${results.adminAuth ? "✅" : "❌"}`);

  const softFails = [results.kgStats, results.kgSample, results.graphSummary].filter((v) => !v).length;
  if (softFails) {
    console.log("\n⚠️ 图谱相关检查失败：通常是 Neo4j 未启动，请确认 bolt://localhost:7687 可连接。");
    process.exitCode = 1;
  }
}

testAPI().catch((e) => {
  console.error("测试脚本自身出错:", e);
  process.exitCode = 1;
});
