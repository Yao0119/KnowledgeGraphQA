App({
  globalData: {
    apiBase: "",
    useMock: true,
    user: { name: "安全分析员", role: "客户", initials: "安" },
  },
  onLaunch() {
    const savedUser = wx.getStorageSync("kg_user");
    if (savedUser) this.globalData.user = savedUser;
  },
});
