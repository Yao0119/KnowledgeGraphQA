/**
 * 知识图谱问答页面
 *
 * 本文件原先包含 200 行被注释掉的旧实现（死代码），已清理；
 * 同时把硬编码的 http://127.0.0.1:8000 换成统一 API 层（相对路径 + Vite 代理）。
 */

import { useState, useRef, useEffect } from "react";
import { Input } from "antd";
import { SendOutlined, LoadingOutlined } from "@ant-design/icons";

import api, { errorMessage } from "../api";

export default function QA() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const messagesRef = useRef(null);

  const handleAsk = async () => {
    if (!question.trim() || loading) return;

    const asked = question.trim();
    setMessages((prev) => [...prev, { role: "user", content: asked }]);
    setQuestion("");
    setLoading(true);

    try {
      const res = await api.post("/api/qa/ask", { question: asked });
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          content: res.data?.answer || "暂无回答。",
          // 后端现在会返回所用三元组与检索策略，展示出来便于确认答案确实有图谱依据
          sources: res.data?.sources ?? [],
          retrieval: res.data?.retrieval ?? null,
        },
      ]);
    } catch (err) {
      // 统一从 FastAPI 的 detail 字段取错误信息（原实现读的是 error 字段，取不到）
      setMessages((prev) => [
        ...prev,
        { role: "bot", content: `❌ ${errorMessage(err)}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    messagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <>
      {/* Apple 式气泡进入动画 */}
      <style>
        {`
        @keyframes bubbleFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}
      </style>

      <div
        className="panel"
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          // 用 flex 填充外壳剩下的高度，而不是 calc(100vh - Npx)：
          // 外壳上还有状态条，任何硬编码的减法都会算错，底部输入栏会被挤出视口。
          flex: "1 1 auto",
          minHeight: 320,
          overflow: "hidden",
          marginTop: 4,
        }}
      >
        {/* 聊天区域 */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            paddingBottom: 24,
          }}
        >
          {/* 空状态：原来没有消息时就是一大片空白，看不出这个页面是干什么的 */}
          {messages.length === 0 && (
            <div
              style={{
                height: "100%",
                display: "grid",
                placeItems: "center",
                textAlign: "center",
                padding: 24,
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--c-fg-muted)" }}>
                  问点什么吧
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: "var(--c-fg-faint)", lineHeight: 1.7 }}>
                  答案来自 Neo4j 图谱检索，例如：
                  <br />
                  RiskWare/MacOS.Apfell 有哪些典型变种？
                </div>
              </div>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                justifyContent:
                  msg.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  maxWidth: "72%",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-lg)",

                  // 气泡用实心色，不用渐变：
                  //   1. 渐变是模板化的视觉痕迹；
                  //   2. 原来的 #0ea5e9 是 Tailwind 蓝，与全站主色 #1E40AF 不是同一个色，
                  //      违反"单一强调色"一致性。
                  background:
                    msg.role === "user" ? "var(--c-primary)" : "var(--c-surface)",
                  // 层级用边框表达，不用投影；用户气泡与助手气泡靠底色区分
                  border:
                    msg.role === "user"
                      ? "1px solid var(--c-primary)"
                      : "1px solid var(--c-border)",
                  color: msg.role === "user" ? "#fff" : "var(--c-fg)",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",

                  animation: "bubbleFadeIn 0.25s ease",
                }}
              >
                {msg.content}

                {/* 图谱依据：折叠展示本次回答用到的三元组 */}
                {msg.role === "bot" && msg.sources?.length > 0 && (
                  <details style={{ marginTop: 8, fontSize: 12, color: "var(--c-fg-muted)" }}>
                    <summary style={{ cursor: "pointer", userSelect: "none" }}>
                      图谱依据 {msg.sources.length} 条
                      {msg.retrieval?.strategy ? `（${msg.retrieval.strategy}）` : ""}
                    </summary>
                    <div style={{ marginTop: 6, whiteSpace: "normal", lineHeight: 1.7 }}>
                      {msg.sources.map((t, i) => (
                        <div key={i} style={{ fontFamily: "monospace" }}>
                          ({t.source}) -[{t.relation}]-&gt; ({t.target})
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          ))}

          {/* 打字中… */}
          {loading && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-start",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  background: "rgba(255,255,255,0.8)",
                  backdropFilter: "blur(12px)",
                  borderRadius: "var(--radius-lg)",
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,

                  boxShadow:
                    "0 4px 8px rgba(0,0,0,0.1), inset 0 1px 1px rgba(255,255,255,0.4)",
                  animation: "bubbleFadeIn 0.25s ease",
                  color: "var(--c-fg-muted)",
                  fontStyle: "italic",
                }}
              >
                <LoadingOutlined spin style={{ color: "var(--c-primary)" }} />
                <span>打字中...</span>
              </div>
            </div>
          )}

          <div ref={messagesRef} />
        </div>

        {/* 底部输入区
            原来是 position:fixed + left:0/right:0：fixed 相对视口定位，
            会脱离外壳的左偏移，输入栏直接横跨到悬浮侧边栏底下。
            改成 sticky 后它留在文档流里，宽度自动跟随面板。 */}
        <div
          style={{
            position: "sticky",
            bottom: 0,
            background: "var(--c-glass-strong)",
            backdropFilter: "var(--c-glass-blur)",
            WebkitBackdropFilter: "var(--c-glass-blur)",
            borderTop: "1px solid var(--c-border)",
            padding: "12px 16px",
            display: "flex",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <div style={{ width: "100%", maxWidth: 960, position: "relative" }}>
            {/* ⌨ 输入框 Apple 化 */}
            <Input.TextArea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={1}
              autoSize={{ minRows: 1, maxRows: 6 }}
              placeholder="请输入你的问题…"
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  handleAsk();
                }
              }}
              disabled={loading}
              style={{
                paddingRight: 56,
                borderRadius: "var(--radius-lg)",
                resize: "none",

                background: "rgba(255,255,255,0.75)",
                backdropFilter: "blur(18px)",
                WebkitBackdropFilter: "blur(18px)",

                border: "1px solid #d1d5db",
                boxShadow:
                  "inset 0 0 3px rgba(255,255,255,0.6), 0 4px 12px rgba(0,0,0,0.08)",

                transition: "background-color 220ms cubic-bezier(0.22,0.61,0.36,1), border-color 220ms cubic-bezier(0.22,0.61,0.36,1), box-shadow 220ms cubic-bezier(0.22,0.61,0.36,1)",
                fontSize: "15px",
              }}
              onFocus={(e) => {
                e.target.style.border = "1px solid var(--c-primary)";
                // 焦点环用中性深灰，不用蓝色发光（单色主题下蓝色是杂色）
                e.target.style.boxShadow =
                  "0 0 0 4px rgba(0,0,0,0.08), inset 0 0 3px rgba(255,255,255,0.6)";
              }}
              onBlur={(e) => {
                e.target.style.border = "1px solid var(--c-border-strong)";
                e.target.style.boxShadow =
                  "inset 0 0 3px rgba(255,255,255,0.6), 0 4px 12px rgba(0,0,0,0.08)";
              }}
            />

            {/* 🟦 Apple iMessage 风发送按钮 */}
            <button
              onClick={handleAsk}
              aria-label="发送"
              disabled={loading}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",

                width: 38,
                height: 38,
                borderRadius: "50%",
                border: "none",

                background: "var(--c-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",

                boxShadow: "none",

                cursor: loading ? "not-allowed" : "pointer",
                transition: "background-color 150ms cubic-bezier(0.22,0.61,0.36,1), border-color 150ms cubic-bezier(0.22,0.61,0.36,1)",
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform =
                  "translateY(-50%) scale(0.92)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform =
                  "translateY(-50%) scale(1)";
              }}
            >
              {loading ? (
                <LoadingOutlined style={{ fontSize: 18, color: "#d1d5db" }} spin />
              ) : (
                <SendOutlined style={{ fontSize: 20, color: "#ffffff" }} />
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
