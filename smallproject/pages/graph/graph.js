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
    graphs: mock.graphs,
    createOpen: false,
    building: false,
    graphForm: { name: "", description: "", language_mode: "dual" },
    sourceFileName: "",
    sourceFilePath: "",
    languageOptions: ["dual", "cn", "en"],
  },
  onLoad() { this.loadGraph(); this.loadGraphs(); },
  async loadGraphs() {
    try {
      const res = await request({ path: "/api/graphs" });
      const graphs = res.data || res;
      this.setData({ graphs: Array.isArray(graphs) && graphs.length ? graphs : mock.graphs });
    } catch (error) {
      this.setData({ graphs: mock.graphs });
    }
  },
  async loadGraph() {
    this.setData({ loading: true });
    try {
      const [summaryRes, graphRes, sampleRes] = await Promise.all([
        request({ path: "/api/graph/summary" }),
        request({ path: "/api/graph/full", data: { seeds: 8, limit: 60 } }),
        request({ path: "/api/graph/samples", data: { limit: 4 } }),
      ]);
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
        };
      });
      const sampleData = sampleRes.data || sampleRes;
      const triples = (sampleData.data || []).map((item) => ({
        source: item.source && item.source.name ? item.source.name : item.source,
        relation: item.relation,
        target: item.target && item.target.name ? item.target.name : item.target,
      }));
      const usableNodes = nodes.length ? nodes : mock.nodes;
      this.setData({
        summary: summaryRes.data || summaryRes,
        nodes: usableNodes,
        filteredNodes: usableNodes,
        triples: triples.length ? triples : mock.triples,
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: "已显示本地图谱样例", icon: "none" });
    }
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
    if (graph) wx.showToast({ title: graph.status === "processing" ? "图谱正在构建" : "已选择 " + graph.name, icon: "none" });
  },
  toggleFullscreen() {
    const isFullscreen = !this.data.isFullscreen;
    this.setData({ isFullscreen });
  },
});
