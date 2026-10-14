const { request } = require("../../utils/api");

Page({
  data: {
    summary: { nodes: 0, relationships: 0, status: "loading" },
    features: [
      { key: "graph", icon: "◈", title: "知识图谱", desc: "从实体和关系中看见威胁脉络" },
      { key: "dual", icon: "双", title: "中英双层对照", desc: "并列查看中文与英文图谱层" },
      { key: "virus", icon: "⌁", title: "病毒检测", desc: "上传样本并查看检测结果" },
      { key: "qa", icon: "?", title: "问答检索", desc: "用自然语言检索图谱证据" },
      { key: "predict", icon: "↗", title: "威胁预测", desc: "基于样本特征生成风险判断" },
    ],
    recent: [],
  },
  onLoad() { this.loadSummary(); },
  onShow() {
    const recent = wx.getStorageSync("kg_qa_history") || [];
    this.setData({ recent: recent.slice(-2).reverse() });
  },
  async loadSummary() {
    try {
      const [summaryRes, healthRes] = await Promise.all([
        request({ path: "/api/graph/summary" }),
        request({ path: "/api/health" }),
      ]);
      const summary = summaryRes.data || summaryRes;
      summary.status = healthRes.overall || (healthRes.backend ? "healthy" : "degraded");
      this.setData({ summary });
    } catch (error) {
      this.setData({ summary: { nodes: 0, relationships: 0, status: "degraded" } });
    }
  },
  openFeature(event) {
    const { key } = event.currentTarget.dataset;
    if (key === "graph") wx.reLaunch({ url: "/pages/graph/graph" });
    if (key === "dual") wx.reLaunch({ url: "/pages/dual/dual" });
    if (key === "virus") wx.reLaunch({ url: "/pages/virus/virus" });
    if (key === "qa") wx.reLaunch({ url: "/pages/qa/qa" });
    if (key === "predict") wx.navigateTo({ url: "/pages/predict/predict" });
  },
  openProfile() { wx.navigateTo({ url: "/pages/profile/profile" }); },
  openRecent(event) {
    const question = event.currentTarget.dataset.question || "";
    wx.setStorageSync("kg_pending_question", question);
    wx.reLaunch({ url: "/pages/qa/qa" });
  },
});
