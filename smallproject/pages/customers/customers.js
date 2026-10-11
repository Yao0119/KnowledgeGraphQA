Page({
  data: {
    customers: [
      { name: "alice", initial: "A", email: "alice@example.com", status: "正常", lastSeen: "今天 09:42" },
      { name: "bob", initial: "B", email: "bob@example.com", status: "正常", lastSeen: "昨天 18:20" },
      { name: "security-team", initial: "S", email: "team@example.com", status: "待确认", lastSeen: "2026-10-10" },
    ],
  },
  showCustomer(event) {
    const customer = this.data.customers.find((item) => item.name === event.currentTarget.dataset.name) || {};
    wx.showModal({ title: customer.name, content: customer.email + "\n状态：" + customer.status + "\n最近访问：" + customer.lastSeen, showCancel: false });
  },
});
