App({
  globalData: {
    apiBase: "https://www.lighthe.site",
    useMock: false,
    token: "",
    user: { name: "安全分析员", role: "客户", initials: "安" },
  },
  onLaunch() {
    const token = wx.getStorageSync("kg_token");
    if (token) this.globalData.token = token;
    const savedUser = wx.getStorageSync("kg_user");
    if (savedUser) this.globalData.user = savedUser;
  },
});
