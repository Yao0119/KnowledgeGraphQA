const app = getApp();
const USE_MOCK = false;
const API_BASE = (app && app.globalData && app.globalData.apiBase) || "https://www.lighthe.site";
const wait = (value, delay = 260) => new Promise((resolve) => setTimeout(() => resolve(value), delay));
const mock = {
  summary: { nodes: 1704218, relationships: 2438096, status: "healthy" },
  graphs: [
    {
      graph_id: "builtin-malware",
      name: "恶意软件知识图谱",
      description: "系统内置的中英双语恶意软件知识图谱。",
      is_builtin: true,
      status: "ready",
      language_mode: "dual",
      node_count: 1704218,
      edge_count: 2438096,
      build_job: null,
    },
  ],
  triples: [
    { source: "Emotet", relation: "病毒家族", target: "木马" },
    { source: "Emotet", relation: "运行环境", target: "Windows" },
    { source: "Emotet", relation: "威胁行为", target: "凭据窃取" },
    { source: "WannaCry", relation: "传播方式", target: "SMB 漏洞利用" },
  ],
  layers: {
    virus: "Emotet",
    cn: [
      { name: "Emotet", type: "恶意软件", relation: "病毒家族" },
      { name: "木马", type: "病毒家族", relation: "运行环境" },
      { name: "Windows", type: "运行环境", relation: "威胁行为" },
      { name: "凭据窃取", type: "威胁行为", relation: "解决方案" },
    ],
    en: [
      { name: "Emotet", type: "Malware", relation: "Family" },
      { name: "Trojan", type: "Family", relation: "Platform" },
      { name: "Windows", type: "Platform", relation: "Behavior" },
      { name: "Credential Theft", type: "Behavior", relation: "Solution" },
    ],
  },
  nodes: [
    { id: "emotet", name: "Emotet", type: "恶意软件", detail: "银行木马 / 下载器", color: "#F26B5E", count: 12 },
    { id: "trojan", name: "木马", type: "病毒家族", detail: "Family", color: "#8B7CF6", count: 8 },
    { id: "windows", name: "Windows", type: "运行环境", detail: "Platform", color: "#3F9AE6", count: 18 },
    { id: "credential", name: "凭据窃取", type: "威胁行为", detail: "Behavior", color: "#F3A64A", count: 6 },
    { id: "powershell", name: "PowerShell", type: "执行方式", detail: "Technique", color: "#18BFAE", count: 9 },
    { id: "wannacry", name: "WannaCry", type: "恶意软件", detail: "勒索软件", color: "#F26B5E", count: 14 },
  ],
  history: [
    { question: "Emotet 的运行环境是什么？", answer: "图谱中记录的主要运行环境为 Windows。它同时关联木马家族和凭据窃取等威胁行为。", sourceCount: 3 },
    { question: "WannaCry 如何传播？", answer: "WannaCry 主要通过 SMB 漏洞进行横向传播，相关节点还连接到勒索软件和 Windows 环境。", sourceCount: 2 },
  ],
};
function getToken() {
  return wx.getStorageSync("kg_token") || "";
}

function authHeader() {
  const token = getToken();
  return token ? { Authorization: "Bearer " + token } : {};
}

function request({ path, method = "GET", data = {} }) {
  if (USE_MOCK || (app && app.globalData && app.globalData.useMock)) {
    if (path === "/api/graphs") return wait({ success: true, data: mock.graphs });
    if (path === "/api/graph/summary") return wait({ success: true, data: mock.summary });
    if (path === "/api/graph/full") return wait({ success: true, data: { nodes: mock.nodes, edges: [], meta: mock.summary } });
    if (path === "/api/graph/layers") return wait({ success: true, data: mock.layers });
    if (path === "/api/qa/ask") {
      const question = data.question || "";
      const answer = question.includes("WannaCry") ? mock.history[1].answer : question.includes("Emotet") ? mock.history[0].answer : "这是本地演示回答。接入后端后，系统会从知识图谱中检索实体、关系和证据，再组织成可核验的回答。";
      return wait({ success: true, question, answer, sources: mock.triples.slice(0, question.includes("WannaCry") ? 2 : 3), retrieval: { strategy: "实体命中 + 邻域扩展" } }, 520);
    }
    if (path === "/api/prediction/predict") return wait({ success: true, prediction: "中风险：疑似下载器行为", confidence: 0.78, details: { matched: ["PowerShell", "外联行为"], suggestion: "建议隔离样本并进一步沙箱分析" } }, 620);
    if (path === "/api/virus-detection") return wait({ success: true, is_malicious: true, threat_level: "medium", summary: "检测到疑似恶意软件特征，建议隔离后进一步分析。", scan_results: [{ label: "文件指纹", detail: "SHA-256 已生成" }, { label: "静态特征匹配", detail: "命中 2 项规则" }, { label: "行为沙箱", detail: "待后端接入" }] }, 720);
    return wait({ success: true, data: mock });
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE + path,
      method,
      data,
      header: Object.assign({ "content-type": "application/json" }, authHeader()),
      success: (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data);
          return;
        }
        const payload = response.data || {};
        reject({
          statusCode: response.statusCode,
          data: payload,
          message: payload.detail || payload.message || "请求失败",
        });
      },
      fail: reject,
    });
  });
}

function login({ username, password }) {
  return request({
    path: "/api/auth/login",
    method: "POST",
    data: { username, password },
  }).then((payload) => {
    const token = payload.access_token || "";
    const user = payload.user || {};
    const displayName = user.username || username;
    const normalizedUser = {
      id: user.id,
      name: displayName,
      role: user.role === "admin" ? "管理员" : "客户",
      initials: displayName.slice(0, 1).toUpperCase() || "用",
    };
    wx.setStorageSync("kg_token", token);
    wx.setStorageSync("kg_user", normalizedUser);
    if (app && app.globalData) {
      app.globalData.token = token;
      app.globalData.user = normalizedUser;
    }
    return payload;
  });
}

function logout() {
  wx.removeStorageSync("kg_token");
  if (app && app.globalData) app.globalData.token = "";
}

function uploadBuild({ name, description, language_mode, filePath, fileName }) {
  if (USE_MOCK || (app && app.globalData && app.globalData.useMock)) {
    const graphId = "graph-" + Date.now();
    const graph = {
      graph_id: graphId,
      name,
      description: description || "",
      is_builtin: false,
      status: "processing",
      language_mode: language_mode || "dual",
      node_count: 0,
      edge_count: 0,
      build_job: {
        job_id: Date.now(),
        status: "pending",
        progress: 8,
        current_stage: "文件已接收，等待解析",
        source_file_name: fileName,
      },
    };
    mock.graphs.unshift(graph);
    setTimeout(() => {
      graph.status = "ready";
      graph.node_count = 128;
      graph.edge_count = 214;
      graph.build_job.status = "ready";
      graph.build_job.progress = 100;
      graph.build_job.current_stage = "构建完成";
    }, 2200);
    return wait({ success: true, data: { graph_id: graphId, job_id: graph.build_job.job_id, build_job: graph.build_job }, message: "文件已接收，图谱正在后台构建" }, 420);
  }
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: API_BASE + "/api/graphs/build",
      filePath,
      name: "file",
      formData: { name, description: description || "", language_mode: language_mode || "dual" },
      header: authHeader(),
      success: (res) => {
        try {
          const payload = JSON.parse(res.data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(payload);
            return;
          }
          reject({ statusCode: res.statusCode, data: payload, message: payload.detail || payload.message || "上传失败" });
        } catch (error) {
          reject(error);
        }
      },
      fail: reject,
    });
  });
}

function uploadScan({ filePath }) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: API_BASE + "/api/virus-detection/upload",
      filePath,
      name: "file",
      header: authHeader(),
      success: (res) => {
        try {
          const payload = JSON.parse(res.data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(payload);
            return;
          }
          reject({ statusCode: res.statusCode, data: payload, message: payload.detail || payload.message || "检测失败" });
        } catch (error) {
          reject(error);
        }
      },
      fail: reject,
    });
  });
}

module.exports = { request, uploadBuild, uploadScan, login, logout, getToken, mock };
