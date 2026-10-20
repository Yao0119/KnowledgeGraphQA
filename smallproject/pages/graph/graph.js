const { request, uploadBuild, mock } = require("../../utils/api");

const TYPE_LABELS = {
  Virus: "恶意软件",
  Malware: "恶意软件",
  MalwareType: "威胁类型",
  Family: "病毒家族",
  Alias: "别名",
  Platform: "运行环境",
  Behavior: "威胁行为",
  Solution: "解决方案",
  Description: "综合描述",
  DateValue: "日期",
  CountValue: "数量",
  Entity: "实体",
};

const TYPE_COLORS = {
  恶意软件: "#F26B5E",
  病毒家族: "#8B7CF6",
  运行环境: "#3F9AE6",
  威胁行为: "#F3A64A",
  解决方案: "#18BFAE",
  威胁类型: "#18BFAE",
};

function normalizeNodeType(type) {
  return TYPE_LABELS[type] || type || "实体";
}

function normalizeColor(type) {
  return TYPE_COLORS[type] || "#6E6E73";
}

function getWindowMetrics() {
  try {
    const info = typeof wx.getWindowInfo === "function" ? wx.getWindowInfo() : wx.getSystemInfoSync();
    return {
      width: info.windowWidth || info.screenWidth || 375,
      height: info.windowHeight || info.screenHeight || 667,
    };
  } catch (error) {
    return { width: 375, height: 667 };
  }
}

function buildMapLayout(nodes, edges, width, height, fullscreen) {
  if (!nodes.length) return { mapNodes: [], mapEdges: [] };

  const visibleNodes = nodes.slice(0, 12);
  let coreIndex = visibleNodes.findIndex((node) => node.isCore);
  if (coreIndex < 0) coreIndex = 0;
  const surrounding = visibleNodes.filter((node, index) => index !== coreIndex);
  const firstRingSize = Math.min(8, surrounding.length);
  const mapNodes = visibleNodes.map((node, index) => {
    if (index === coreIndex) {
      return Object.assign({}, node, { x: 50, y: 50, isCore: true });
    }

    const surroundingIndex = index < coreIndex ? index : index - 1;
    const ring = surroundingIndex < firstRingSize ? 0 : 1;
    const ringIndex = ring === 0 ? surroundingIndex : surroundingIndex - firstRingSize;
    const ringCount = ring === 0 ? firstRingSize : surrounding.length - firstRingSize;
    const angle = -Math.PI / 2 + (Math.PI * 2 * ringIndex) / Math.max(ringCount, 1);
    const radiusX = fullscreen ? (ring === 0 ? 33 : 43) : (ring === 0 ? 34 : 43);
    const radiusY = fullscreen ? (ring === 0 ? 31 : 42) : (ring === 0 ? 20 : 27);

    return Object.assign({}, node, {
      x: Math.round(50 + Math.cos(angle) * radiusX),
      y: Math.round(50 + Math.sin(angle) * radiusY),
      isCore: false,
    });
  });

  const nodePositions = {};
  mapNodes.forEach((node) => { nodePositions[node.id] = node; });
  const mapWidth = fullscreen ? width : width * (1 - 64 / 750);
  const mapHeight = fullscreen ? height : width * (390 / 750);
  const mapEdges = [];
  (edges || []).some((edge, index) => {
    const source = nodePositions[edge.from];
    const target = nodePositions[edge.to];
    if (!source || !target || source.id === target.id) return false;

    const x1 = (source.x / 100) * mapWidth;
    const y1 = (source.y / 100) * mapHeight;
    const dx = ((target.x - source.x) / 100) * mapWidth;
    const dy = ((target.y - source.y) / 100) * mapHeight;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (!length) return false;

    mapEdges.push({
      key: edge.from + "-" + edge.to + "-" + index,
      style: "left:" + x1 + "px;top:" + y1 + "px;width:" + length + "px;transform:rotate(" + (Math.atan2(dy, dx) * 180 / Math.PI) + "deg);",
    });
    return mapEdges.length >= 24;
  });

  return { mapNodes, mapEdges };
}

Page({
  data: {
    keyword: "",
    nodes: mock.nodes,
    filteredNodes: mock.nodes,
    activeFilter: "全部",
    filters: ["全部", "恶意软件", "病毒家族", "运行环境", "威胁行为"],
    summary: { nodes: 0, relationships: 0 },
    loading: false,
    triples: mock.triples,
    isFullscreen: false,
    graphError: "",
    graphEdges: [],
    mapNodes: [],
    mapEdges: [],
    graphs: mock.graphs,
    selectedGraphId: "builtin-malware",
    selectedGraph: mock.graphs[0],
    windowWidth: 375,
    windowHeight: 667,
    createOpen: false,
    building: false,
    graphForm: { name: "", description: "", language_mode: "dual" },
    sourceFileName: "",
    sourceFilePath: "",
    languageOptions: ["dual", "cn", "en"],
  },
  onLoad() {
    const metrics = getWindowMetrics();
    this.setData({ windowWidth: metrics.width, windowHeight: metrics.height });
    this._windowResizeHandler = () => {
      const nextMetrics = getWindowMetrics();
      this.setData({ windowWidth: nextMetrics.width, windowHeight: nextMetrics.height }, () => this.layoutMap());
    };
    if (typeof wx.onWindowResize === "function") wx.onWindowResize(this._windowResizeHandler);
    this.loadGraphs();
  },
  onUnload() {
    if (this._windowResizeHandler && typeof wx.offWindowResize === "function") {
      wx.offWindowResize(this._windowResizeHandler);
    }
  },
  async loadGraphs() {
    let graphs = mock.graphs;
    try {
      const res = await request({ path: "/api/graphs" });
      const payload = res.data || res;
      if (Array.isArray(payload) && payload.length) graphs = payload;
    } catch (error) {
      graphs = mock.graphs;
    }
    const selectedGraph = graphs.find((item) => item.graph_id === this.data.selectedGraphId)
      || graphs.find((item) => item.is_builtin)
      || graphs[0];
    this.setData({
      graphs,
      selectedGraph,
      selectedGraphId: selectedGraph ? selectedGraph.graph_id : "builtin-malware",
    });
    if (selectedGraph) await this.loadGraph(selectedGraph.graph_id);
  },
  async loadGraph(graphId) {
    const requestedGraphId = graphId || this.data.selectedGraphId || "builtin-malware";
    this._graphRequestId = (this._graphRequestId || 0) + 1;
    const requestId = this._graphRequestId;
    this.setData({ loading: true, graphError: "", mapNodes: [], mapEdges: [] });
    try {
      const [summaryRes, graphRes, sampleRes] = await Promise.all([
        request({ path: "/api/graph/summary", data: { graph_id: requestedGraphId } }),
        request({ path: "/api/graph/full", data: { graph_id: requestedGraphId, seeds: 8, limit: 60 } }),
        request({ path: "/api/graph/samples", data: { graph_id: requestedGraphId, limit: 4 } }),
      ]);
      if (requestId !== this._graphRequestId) return;
      const graphData = graphRes.data || graphRes;
      const rawNodes = graphData.nodes || [];
      const rawEdges = graphData.edges || [];
      const degree = {};
      rawEdges.forEach((edge) => {
        degree[edge.from] = (degree[edge.from] || 0) + 1;
        degree[edge.to] = (degree[edge.to] || 0) + 1;
      });
      const nodes = rawNodes.map((node) => {
        const type = normalizeNodeType(node.type);
        return {
          id: node.id,
          name: node.label || node.name || node.name_orig || "未命名实体",
          type,
          detail: node.name_orig && node.name_orig !== node.label ? node.name_orig : (node.lang === "en" ? "English" : "中文图谱"),
          color: normalizeColor(type),
          count: degree[node.id] || 0,
          isCore: Boolean(node.is_core),
          shortName: (node.label || node.name || node.name_orig || "未命名实体").length > 8
            ? (node.label || node.name || node.name_orig || "未命名实体").slice(0, 7) + "…"
            : (node.label || node.name || node.name_orig || "未命名实体"),
          typeShort: type.length > 4 ? type.slice(0, 4) : type,
        };
      });
      const sampleData = sampleRes.data || sampleRes;
      const triples = (sampleData.data || []).map((item) => ({
        source: item.source && item.source.name ? item.source.name : item.source,
        relation: item.relation,
        target: item.target && item.target.name ? item.target.name : item.target,
      }));
      this.setData({
        summary: summaryRes.data || summaryRes,
        nodes,
        filteredNodes: nodes,
        triples: triples.length ? triples : mock.triples,
        graphEdges: rawEdges,
        loading: false,
        graphError: nodes.length ? "" : "该图谱暂时没有可显示的实体数据",
      }, () => this.layoutMap());
    } catch (error) {
      if (requestId !== this._graphRequestId) return;
      this.setData({ loading: false, graphError: "图谱加载失败，请检查连接后重试。", nodes: [], filteredNodes: [], graphEdges: [], mapNodes: [], mapEdges: [] });
      wx.showToast({ title: (error && error.message) || "图谱加载失败", icon: "none" });
    }
  },
  layoutMap() {
    const layout = buildMapLayout(
      this.data.nodes,
      this.data.graphEdges,
      this.data.windowWidth,
      this.data.windowHeight,
      this.data.isFullscreen,
    );
    this.setData(layout);
  },
  onSearchInput(event) { this.setData({ keyword: event.detail.value }, this.filterNodes); },
  chooseFilter(event) { this.setData({ activeFilter: event.currentTarget.dataset.filter }, this.filterNodes); },
  filterNodes() {
    const { keyword, activeFilter, nodes } = this.data;
    const normalized = keyword.trim().toLowerCase();
    const filteredNodes = nodes.filter((node) => {
      const matchText = !normalized || (node.name + node.type + node.detail).toLowerCase().includes(normalized);
      const matchType = activeFilter === "全部" || node.type === activeFilter;
      return matchText && matchType;
    });
    this.setData({ filteredNodes });
  },
  showNode(event) {
    const node = this.data.nodes.find((item) => item.id === event.currentTarget.dataset.nodeId) || {};
    wx.showModal({ title: node.name, content: node.type + " · " + node.detail + "\n关联关系 " + (node.count || 0) + " 条", showCancel: false });
  },
  showTriples() {
    const text = this.data.triples.map((item) => item.source + "  —  " + item.relation + "  →  " + item.target).join("\n");
    wx.showModal({ title: "三元组样例", content: text || "暂无样例", showCancel: false });
  },
  addNode() {
    wx.showToast({ title: "管理员写入接口待接入", icon: "none" });
  },
  openCreateGraph() {
    this.setData({ createOpen: true });
  },
  closeCreateGraph() {
    if (!this.data.building) this.setData({ createOpen: false });
  },
  noop() {},
  onGraphFieldInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ ["graphForm." + field]: event.detail.value });
  },
  chooseLanguage(event) {
    this.setData({ "graphForm.language_mode": event.currentTarget.dataset.value });
  },
  chooseSourceFile() {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      success: (res) => {
        const file = res.tempFiles[0];
        const name = file.name || "";
        if (!/.(txt|md|markdown)$/i.test(name)) {
          wx.showToast({ title: "仅支持 TXT 或 Markdown", icon: "none" });
          return;
        }
        this.setData({ sourceFileName: name, sourceFilePath: file.path });
      },
      fail: () => {},
    });
  },
  async submitGraphBuild() {
    const { graphForm, sourceFilePath, sourceFileName } = this.data;
    if (!graphForm.name.trim()) {
      wx.showToast({ title: "请输入图谱名称", icon: "none" });
      return;
    }
    if (!sourceFilePath) {
      wx.showToast({ title: "请先选择 TXT 或 Markdown 文件", icon: "none" });
      return;
    }
    this.setData({ building: true });
    try {
      await uploadBuild({
        name: graphForm.name.trim(),
        description: graphForm.description.trim(),
        language_mode: graphForm.language_mode,
        filePath: sourceFilePath,
        fileName: sourceFileName,
      });
      await this.loadGraphs();
      this.setData({
        createOpen: false,
        building: false,
        graphForm: { name: "", description: "", language_mode: "dual" },
        sourceFileName: "",
        sourceFilePath: "",
      });
      wx.showToast({ title: "已提交，后台构建中", icon: "success" });
    } catch (error) {
      this.setData({ building: false });
      if (error && error.statusCode === 401) {
        wx.showModal({
          title: "需要登录",
          content: "创建图谱需要登录令牌，请先到“我的”页面登录。",
          confirmText: "去登录",
          success: (res) => { if (res.confirm) wx.navigateTo({ url: "/pages/profile/profile" }); },
        });
        return;
      }
      wx.showToast({ title: "创建图谱失败", icon: "none" });
    }
  },
  openGraph(event) {
    const graph = this.data.graphs.find((item) => item.graph_id === event.currentTarget.dataset.graphId);
    if (!graph) return;
    if (graph.status === "processing") {
      wx.showToast({ title: "图谱正在构建完成后即可查看", icon: "none" });
      return;
    }
    this.setData({ selectedGraphId: graph.graph_id, selectedGraph: graph }, () => this.loadGraph(graph.graph_id));
  },
  toggleFullscreen() {
    const isFullscreen = !this.data.isFullscreen;
    this.setData({ isFullscreen }, () => this.layoutMap());
  },
});
