Component({
  properties: {
    active: { type: String, value: "home" },
  },
  data: {
    items: [
      { key: "home", label: "首页", icon: "⌂", path: "/pages/index/index" },
      { key: "graph", label: "图谱", icon: "◇", path: "/pages/graph/graph" },
      { key: "dual", label: "双层", icon: "⇄", path: "/pages/dual/dual" },
      { key: "virus", label: "检测", icon: "⌁", path: "/pages/virus/virus" },
      { key: "qa", label: "问答", icon: "?", path: "/pages/qa/qa" },
    ],
  },
  methods: {
    switchPage(event) {
      const item = this.data.items.find((entry) => entry.key === event.currentTarget.dataset.key);
      if (!item || item.key === this.properties.active) return;
      wx.reLaunch({ url: item.path });
    },
  },
});
