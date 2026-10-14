const { request, login, logout } = require("../../utils/api");

Page({
  data: {
    user: { name: "安全分析员", role: "客户", initials: "安" },
    apiBase: "",
    connected: false,
    backendStatus: "检测中",
    username: "",
    password: "",
    loginLoading: false,
    settings: [
      { key: "source", label: "图谱数据源", value: "内置恶意软件图谱" },
      { key: "language", label: "对照语言", value: "中文 / English" },
      { key: "backend", label: "后端状态", value: "检测中" },
    ],
  },
  onShow() {
    const app = getApp();
    const token = wx.getStorageSync("kg_token") || "";
    this.setData({
      user: app.globalData.user,
      apiBase: app.globalData.apiBase,
      connected: !!token,
    });
    this.loadHealth();
  },
  async loadHealth() {
    try {
      const health = await request({ path: "/api/health" });
      const backendStatus = health.overall === "healthy" ? "运行正常" : "部分服务降级";
      const settings = this.data.settings.map((item) => item.key === "backend" ? Object.assign({}, item, { value: backendStatus }) : item);
      this.setData({ backendStatus, settings });
    } catch (error) {
      const settings = this.data.settings.map((item) => item.key === "backend" ? Object.assign({}, item, { value: "连接失败" }) : item);
      this.setData({ backendStatus: "连接失败", settings });
    }
  },
  onUsernameInput(event) { this.setData({ username: event.detail.value }); },
  onPasswordInput(event) { this.setData({ password: event.detail.value }); },
  async submitLogin() {
    const username = this.data.username.trim();
    const password = this.data.password;
    if (!username || !password) {
      wx.showToast({ title: "请输入账号和密码", icon: "none" });
      return;
    }
    this.setData({ loginLoading: true });
    try {
      const result = await login({ username, password });
      const app = getApp();
      this.setData({
        user: app.globalData.user,
        connected: true,
        loginLoading: false,
        password: "",
      });
      wx.showToast({ title: result.user && result.user.role === "admin" ? "管理员已登录" : "登录成功", icon: "success" });
    } catch (error) {
      this.setData({ loginLoading: false });
      wx.showToast({ title: (error && error.message) || "登录失败", icon: "none" });
    }
  },
  submitLogout() {
    logout();
    this.setData({ connected: false, password: "" });
    wx.showToast({ title: "已退出登录", icon: "none" });
  },
  showAbout() {
    wx.showModal({ title: "关于知识图谱安全分析", content: "移动端已连接 KnowledgeGraphQA 后端服务，图谱、问答、检测与预测接口均通过统一 API 层访问。", showCancel: false });
  },
  openCustomers() { wx.navigateTo({ url: "/pages/customers/customers" }); },
  clearLocalData() {
    wx.showModal({ title: "清除本地记录", content: "将清除问答历史，不会影响图谱数据。", success: (res) => { if (res.confirm) { wx.removeStorageSync("kg_qa_history"); wx.showToast({ title: "已清除", icon: "success" }); } } });
  },
});
