const { uploadScan } = require("../../utils/api");

Page({
  data: {
    fileName: "",
    filePath: "",
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
      success: (res) => this.setData({ fileName: res.tempFiles[0].name, filePath: res.tempFiles[0].path, report: null }),
      fail: () => wx.showToast({ title: "未选择文件", icon: "none" }),
    });
  },
  async startScan() {
    if (!this.data.filePath) {
      wx.showToast({ title: "请先选择文件", icon: "none" });
      return;
    }
    this.setData({ scanning: true, report: null });
    try {
      const report = await uploadScan({ filePath: this.data.filePath });
      report.scan_results = (report.scan_results || []).map((item) => ({
        label: item.engine || item.label || "ClamAV",
        detail: [item.status, item.result || item.detail].filter(Boolean).join(" · "),
      }));
      this.setData({ report, scanning: false });
    } catch (error) {
      this.setData({ scanning: false });
      wx.showToast({ title: (error && error.message) || "检测服务暂未连接", icon: "none" });
    }
  },
});
