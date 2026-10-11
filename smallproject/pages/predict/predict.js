const { request } = require("../../utils/api");

Page({
  data: { sample: "", behavior: "", loading: false, result: null },
  onSampleInput(event) { this.setData({ sample: event.detail.value }); },
  onBehaviorInput(event) { this.setData({ behavior: event.detail.value }); },
  async predict() {
    if (!this.data.sample.trim() && !this.data.behavior.trim()) {
      wx.showToast({ title: "请输入样本或行为特征", icon: "none" });
      return;
    }
    this.setData({ loading: true, result: null });
    try {
      const res = await request({ path: "/api/prediction/predict", method: "POST", data: { data: { sample: this.data.sample, behavior: this.data.behavior } } });
      const result = res.data || res;
      result.confidenceText = Math.round((result.confidence || 0) * 100) + "%";
      this.setData({ result, loading: false });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: "预测服务暂未连接", icon: "none" });
    }
  },
});
