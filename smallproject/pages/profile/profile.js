Page({
  data: {
    user: { name: "安全分析员", role: "客户", initials: "安" },
    settings: [
      { key: "source", label: "图谱数据源", value: "内置恶意软件图谱" },
      { key: "language", label: "对照语言", value: "中文 / English" },
      { key: "backend", label: "后端状态", value: "暂未连接" },
    ],
  },
  onShow() {
    const app = getApp();
    this.setData({ user: app.globalData.user });
  },
  showAbout() {
    wx.showModal({ title: "关于知识图谱安全分析", content: "移动端入口基于 KnowledgeGraphQA 项目构建。当前使用本地 mock 数据，后端接口预留在 utils/api.js。", showCancel: false });
  },
  openCustomers() { wx.navigateTo({ url: "/pages/customers/customers" }); },
  clearLocalData() {
    wx.showModal({ title: "清除本地记录", content: "将清除问答历史，不会影响图谱数据。", success: (res) => { if (res.confirm) { wx.removeStorageSync("kg_qa_history"); wx.showToast({ title: "已清除", icon: "success" }); } } });
  },
});
