const { request, mock } = require("../../utils/api");

Page({
  data: {
    question: "",
    messages: [],
    suggestions: ["Emotet 的运行环境是什么？", "WannaCry 如何传播？", "什么是凭据窃取？"],
    loading: false,
    expanded: {},
    canSend: false,
  },
  onShow() {
    const pending = wx.getStorageSync("kg_pending_question");
    if (pending) {
      wx.removeStorageSync("kg_pending_question");
      this.setData({ question: pending });
    }
    const history = wx.getStorageSync("kg_qa_history") || [];
    if (!this.data.messages.length && history.length) {
      const messages = history.slice(-4).reduce((all, item) => all.concat([
        { role: "user", content: item.question, time: "" },
        { role: "bot", content: item.answer, sources: mock.triples.slice(0, item.sourceCount || 0), time: "" },
      ]), []);
      this.setData({ messages });
    }
  },
  onInput(event) { this.setData({ question: event.detail.value, canSend: !!event.detail.value.trim() }); },
  useSuggestion(event) { const question = event.currentTarget.dataset.question; this.setData({ question, canSend: true }); },
  async sendQuestion() {
    const question = this.data.question.trim();
    if (!question || this.data.loading) return;
    const userMessage = { role: "user", content: question, time: this.formatTime(new Date()) };
    this.setData({ messages: this.data.messages.concat(userMessage), question: "", canSend: false, loading: true });
    try {
      const res = await request({ path: "/api/qa/ask", method: "POST", data: { question, graph_id: "builtin-malware" } });
      const payload = res.data || res;
      const botMessage = { role: "bot", content: payload.answer || "暂无回答", sources: payload.sources || mock.triples.slice(0, 2), retrieval: payload.retrieval, time: this.formatTime(new Date()) };
      const messages = this.data.messages.concat(botMessage);
      this.setData({ messages, loading: false });
      this.saveHistory(messages);
    } catch (error) {
      this.setData({ messages: this.data.messages.concat({ role: "bot", content: "暂时无法连接后端，请稍后再试。", time: this.formatTime(new Date()) }), loading: false });
    }
  },
  toggleSources(event) {
    const index = event.currentTarget.dataset.index;
    this.setData({ ["expanded." + index]: !this.data.expanded[index] });
  },
  clearMessages() {
    this.setData({ messages: [], expanded: {} });
    wx.removeStorageSync("kg_qa_history");
  },
  saveHistory(messages) {
    let lastQuestion = "";
    const history = [];
    messages.forEach((item) => {
      if (item.role === "user") lastQuestion = item.content;
      if (item.role === "bot") history.push({ question: lastQuestion, answer: item.content, sourceCount: (item.sources || []).length });
    });
    wx.setStorageSync("kg_qa_history", history.slice(-8));
  },
  formatTime(date) {
    return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
  },
});
