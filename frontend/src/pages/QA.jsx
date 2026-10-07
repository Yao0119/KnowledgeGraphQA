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
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 56px)",
          backgroundColor: "#f8fafc",
        }}
      >
        {/* 聊天区域 */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            paddingBottom: 100,
          }}
        >
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
                  borderRadius: 18,

                  // 🍏 Apple 风光感气泡
                  background:
                    msg.role === "user"
                      ? "linear-gradient(145deg, #0ea5e9, #0284c7)"
                      : "linear-gradient(145deg, #ffffff, #f3f4f6)",
                  boxShadow:
                    msg.role === "user"
                      ? "0 4px 8px rgba(14,165,233,0.35), inset 0 1px 1px rgba(255,255,255,0.4)"
                      : "0 4px 8px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.4)",

                  color: msg.role === "user" ? "#fff" : "#111827",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",

                  animation: "bubbleFadeIn 0.25s ease",
                }}
              >
                {msg.content}

                {/* 图谱依据：折叠展示本次回答用到的三元组 */}
                {msg.role === "bot" && msg.sources?.length > 0 && (
                  <details style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
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
                  borderRadius: 18,
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,

                  boxShadow:
                    "0 4px 8px rgba(0,0,0,0.1), inset 0 1px 1px rgba(255,255,255,0.4)",
                  animation: "bubbleFadeIn 0.25s ease",
                  color: "#6b7280",
                  fontStyle: "italic",
                }}
              >
                <LoadingOutlined spin style={{ color: "#3b82f6" }} />
                <span>打字中...</span>
              </div>
            </div>
          )}

          <div ref={messagesRef} />
        </div>

        {/* ⬇⬇⬇ Apple 风格底部输入区域（完整磨砂玻璃） */}
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,

            background: "rgba(255,255,255,0.72)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderTop: "1px solid rgba(255,255,255,0.45)",
            boxShadow: "0 -6px 20px rgba(0,0,0,0.05)",

            padding: "14px 18px",
            display: "flex",
            justifyContent: "center",
            zIndex: 1000,
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
                borderRadius: 14,
                resize: "none",

                background: "rgba(255,255,255,0.75)",
                backdropFilter: "blur(18px)",
                WebkitBackdropFilter: "blur(18px)",

                border: "1px solid #d1d5db",
                boxShadow:
                  "inset 0 0 3px rgba(255,255,255,0.6), 0 4px 12px rgba(0,0,0,0.08)",

                transition: "all 0.25s ease",
                fontSize: "15px",
              }}
              onFocus={(e) => {
                e.target.style.border = "1px solid #3b82f6";
                e.target.style.boxShadow =
                  "0 0 0 4px rgba(59,130,246,0.25), inset 0 0 3px rgba(255,255,255,0.6)";
              }}
              onBlur={(e) => {
                e.target.style.border = "1px solid #d1d5db";
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

                background: "linear-gradient(145deg, #3b82f6, #2563eb)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",

                boxShadow: "0 4px 8px rgba(59,130,246,0.35)",

                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
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
