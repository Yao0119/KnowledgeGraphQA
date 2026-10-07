/**
 * 系统推理页面
 *
 * 修复记录：原先请求的是 POST /api/reasoning，但后端实际暴露的是
 * POST /api/reasoning/reason（见 backend/functions/routes.py），
 * 因此每次提问都 404、页面上永远只有 "❌ ..."。
 * 同时删除了文件开头 172 行被注释掉的旧实现（死代码）。
 */

import { useState } from "react";
import { Input, Card, message } from "antd";
import { SendOutlined, LoadingOutlined } from "@ant-design/icons";

import api, { errorMessage } from "../api";

export default function Reasoning() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]); // 保存对话记录

  const handleReasoning = async () => {
    if (!question.trim() || loading) {
      if (!question.trim()) message.warning("请输入问题！");
      return;
    }

    const asked = question.trim();
    setQuestion("");
    setLoading(true);

    try {
      const res = await api.post("/api/reasoning/reason", { question: asked });

      setHistory((prev) => [
        ...prev,
        { question: asked, answer: res.data?.answer || "未推理出结果" },
      ]);
    } catch (err) {
      const msg = errorMessage(err, "推理失败，请检查后端服务。");
      message.error(msg);
      setHistory((prev) => [...prev, { question: asked, answer: `❌ ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "relative",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f9fafb",
        overflow: "hidden",
      }}
    >
      {/* 内容区 */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px 20px 100px",
        }}
      >
        <Card
          title="系统推理"
          variant="borderless"
          style={{
            maxWidth: 800,
            margin: "0 auto",
            background: "#fff",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            borderRadius: 12,
          }}
        >
          {history.length > 0 ? (
            history.map((item, idx) => (
              <div
                key={idx}
                style={{
                  background: "#f3f4f6",
                  borderRadius: 8,
                  padding: "12px 16px",
                  color: "#111827",
                  fontSize: 15,
                  lineHeight: 1.6,
                  marginBottom: 12,
                }}
              >
                <strong>问题：</strong> {item.question}
                <p style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                  <strong>推理结果：</strong> {item.answer}
                </p>
              </div>
            ))
          ) : (
            <p style={{ color: "#9ca3af", textAlign: "center", margin: 0 }}>
              👇 请输入你的推理问题，系统将自动分析推理
            </p>
          )}

          {loading && (
            <p style={{ color: "#6b7280", textAlign: "center", margin: 0 }}>
              <LoadingOutlined spin /> 正在结合知识图谱推理…
            </p>
          )}
        </Card>
      </div>

      {/* 底部输入区 */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          background: "#ffffff",
          borderTop: "1px solid #e5e7eb",
          padding: "14px 18px",
          display: "flex",
          justifyContent: "center",
          zIndex: 1000,
          boxShadow: "0 -2px 6px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ width: "100%", maxWidth: 960, position: "relative" }}>
          <Input.TextArea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={1}
            autoSize={{ minRows: 1, maxRows: 6 }}
            placeholder="请输入你的推理问题..."
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleReasoning();
              }
            }}
            disabled={loading}
            style={{
              paddingRight: 56,
              borderRadius: 12,
              resize: "none",
              border: "2px solid #60a5fa",
              borderBottom: "3px solid #2563eb",
              boxShadow: "0 0 6px rgba(59,130,246,0.15)",
              transition: "all 0.25s ease-in-out",
              fontSize: "15px",
            }}
          />

          {/* 发送按钮 */}
          <button
            onClick={handleReasoning}
            aria-label="发送"
            disabled={loading}
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              border: "none",
              background: "transparent",
              cursor: loading ? "not-allowed" : "pointer",
              padding: 8,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1010,
            }}
          >
            {loading ? (
              <LoadingOutlined style={{ fontSize: 18, color: "#9ca3af" }} spin />
            ) : (
              <SendOutlined style={{ fontSize: 20, color: "#2563eb" }} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
