const { request, mock } = require("../../utils/api");

Page({
  data: {
    virus: "Emotet",
    candidates: ["Emotet", "WannaCry", "Zeus"],
    layers: mock.layers,
    selected: null,
    relations: mock.layers.cn.map((item, index) => ({ cn: item.name, relation: item.relation, en: mock.layers.en[index].name })),
    loading: false,
  },
  onLoad() { this.loadLayers(); },
  async loadLayers() {
    this.setData({ loading: true });
    try {
      const res = await request({ path: "/api/graph/layers", data: { virus: this.data.virus } });
      const layers = res.data || res;
      this.setData({ layers, relations: layers.cn.map((item, index) => ({ cn: item.name, relation: item.relation, en: layers.en[index].name })), loading: false });
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
        if (virus !== "Emotet") wx.showToast({ title: "该样例待后端返回", icon: "none" });
        else this.loadLayers();
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
