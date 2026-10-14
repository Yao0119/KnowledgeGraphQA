const { request } = require("../../utils/api");

Page({
  data: {
    stats: { total: 0, active: 0 },
    customers: [
      { name: "alice", initial: "A", email: "alice@example.com", status: "正常", lastSeen: "今天 09:42" },
      { name: "bob", initial: "B", email: "bob@example.com", status: "正常", lastSeen: "昨天 18:20" },
      { name: "security-team", initial: "S", email: "team@example.com", status: "待确认", lastSeen: "2026-10-10" },
    ],
  },
  onShow() {
    if (wx.getStorageSync("kg_token")) this.loadCustomers();
  },
  async loadCustomers() {
    try {
      const list = await request({ path: "/api/admin/customers" });
      const customers = (list || []).map((item) => ({
        id: item.id,
        name: item.username,
        initial: (item.username || "U").slice(0, 1).toUpperCase(),
        email: item.email || "未填写邮箱",
        status: "正常",
        lastSeen: item.created_at ? item.created_at.slice(0, 10) : "暂无记录",
      }));
      this.setData({ customers: customers.length ? customers : this.data.customers, stats: { total: customers.length, active: customers.length } });
    } catch (error) {
      wx.showToast({ title: "客户列表读取失败", icon: "none" });
    }
  },
  showCustomer(event) {
    const customer = this.data.customers.find((item) => item.name === event.currentTarget.dataset.name) || {};
    wx.showModal({ title: customer.name, content: customer.email + "\n状态：" + customer.status + "\n最近访问：" + customer.lastSeen, showCancel: false });
  },
});
