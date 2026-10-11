const { request } = require("../../utils/api");

Page({
  data: {
    fileName: "",
    scanning: false,
    report: null,
    checks: [
      { label: "计算文件指纹", detail: "SHA-256", icon: "01" },
      { label: "静态特征匹配", detail: "文件结构 · 入口点", icon: "02" },
      { label: "行为沙箱", detail: "隔离环境观察", icon: "03" },
      { label: "特征码库比对", detail: "已知样本特征", icon: "04" },
    ],
  },
  chooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      success: (res) => this.setData({ fileName: res.tempFiles[0].name, report: null }),
      fail: () => wx.showToast({ title: "未选择文件，已进入演示模式", icon: "none" }),
    });
  },
  async startScan() {
    this.setData({ scanning: true, report: null });
    try {
      const res = await request({ path: "/api/virus-detection", method: "POST", data: { file_name: this.data.fileName || "demo-sample.exe" } });
      this.setData({ report: res.data || res, scanning: false });
    } catch (error) {
      this.setData({ scanning: false });
      wx.showToast({ title: "检测服务暂未连接", icon: "none" });
    }
  },
});
