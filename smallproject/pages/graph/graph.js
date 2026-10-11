const { request, uploadBuild, mock } = require("../../utils/api");

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
      this.setData({ graphs: res.data || mock.graphs });
    } catch (error) {
      this.setData({ graphs: mock.graphs });
    }
  },
  async loadGraph() {
    this.setData({ loading: true });
    try {
      const [summaryRes, graphRes] = await Promise.all([request({ path: "/api/graph/summary" }), request({ path: "/api/graph/full" })]);
      const nodes = (graphRes.data && graphRes.data.nodes) || mock.nodes;
      this.setData({ summary: summaryRes.data || summaryRes, nodes, filteredNodes: nodes, loading: false });
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
