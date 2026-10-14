const { request, mock } = require("../../utils/api");

Page({
  data: {
    virus: "",
    candidates: [],
    layers: mock.layers,
    selected: null,
    relations: mock.layers.cn.map((item, index) => ({ cn: item.name, relation: item.relation, en: mock.layers.en[index].name })),
    loading: false,
  },
  onLoad() { this.loadCandidates(); },
  async loadCandidates() {
    try {
      const res = await request({ path: "/api/graph/malware-list", data: { limit: 30 } });
      const candidates = (res.data || res || []).map((item) => item.name).filter(Boolean);
      this.setData({ candidates, virus: candidates[0] || "Emotet" });
      this.loadLayers();
    } catch (error) {
      this.setData({ candidates: ["Emotet", "WannaCry", "Zeus"], virus: "Emotet" });
      this.loadLayers();
    }
  },
  async loadLayers() {
    this.setData({ loading: true });
    try {
      const res = await request({ path: "/api/graph/layers", data: { virus: this.data.virus } });
      const payload = res.data || res;
      const cnNodes = (payload.cn && payload.cn.nodes) || [];
      const enNodes = (payload.en && payload.en.nodes) || [];
      const nodeMap = {};
      cnNodes.forEach((node) => { nodeMap[node.id] = node; });
      const enNodeMap = {};
      enNodes.forEach((node) => { enNodeMap[node.id] = node; });
      const layers = {
        cn: cnNodes.map((node) => ({ name: node.label || node.name, type: node.type, relation: node.relation })),
        en: enNodes.map((node) => ({ name: node.label || node.name, type: node.type, relation: node.relation })),
      };
      const cnEdges = (payload.cn && payload.cn.edges) || [];
      const enEdges = (payload.en && payload.en.edges) || [];
      const relations = cnEdges.slice(0, 8).map((edge, index) => ({
        cn: nodeMap[edge.from] ? nodeMap[edge.from].label : "",
        relation: edge.label,
        en: enEdges[index] && enNodeMap[enEdges[index].from] ? enNodeMap[enEdges[index].from].label : "",
      }));
      this.setData({
        layers: layers.cn.length ? layers : mock.layers,
        relations: relations.length ? relations : mock.layers.cn.map((item, idx) => ({ cn: item.name, relation: item.relation, en: mock.layers.en[idx].name })),
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: "已显示本地对照样例", icon: "none" });
    }
  },
  chooseVirus() {
    wx.showActionSheet({
      itemList: this.data.candidates,
      success: (res) => {
        const virus = this.data.candidates[res.tapIndex];
        this.setData({ virus });
        this.loadLayers();
      },
    });
  },
  showNode(event) {
    const name = event.currentTarget.dataset.nodeName;
    const all = this.data.layers.cn.concat(this.data.layers.en);
    this.setData({ selected: all.find((item) => item.name === name) || null });
  },
  noop() {},
  closeDetail() { this.setData({ selected: null }); },
});
