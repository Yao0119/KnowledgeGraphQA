import { useState, useEffect } from "react";
import { Input, Button, message, Checkbox, Row, Col } from "antd";
import { UserOutlined, LockOutlined, RightOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

import api, { setSession, errorMessage } from "../api";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // 如果已经登录，直接跳转到首页
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      navigate("/dashboard");
    }
  }, [navigate]);

  const handleLogin = async () => {
    if (!username || !password) {
      message.warning("请输入账号和密码");
      return;
    }
    setLoading(true);
    try {
      // 统一走 src/api.js：相对路径 /api，由 Vite 代理转发，
      // 不再对 localhost / 127.0.0.1 / 0.0.0.0 三个地址做轮询尝试
      // （0.0.0.0 作为客户端目标是非法的，轮询还会把真实错误埋在 console 里）。
      const res = await api.post("/api/auth/login", { username, password });

      setSession({ token: res.data.access_token, user: res.data.user });
      message.success("登录成功，正在跳转...");
      setTimeout(() => {
        navigate("/");
      }, 800);
    } catch (err) {
      console.error("登录错误:", err);
      message.error(errorMessage(err, "网络错误或服务器不可用"));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  // 定义样式对象 (更加稳健的 iOS 风格)
  const styles = {
    container: {
      minHeight: "100vh",
      width: "100%",
      backgroundColor: "#f2f2f7",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: "20px",
      margin: 0,
      boxSizing: "border-box",
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
    },
    card: {
      width: "100%",
      maxWidth: "400px",
      backgroundColor: "#ffffff",
      borderRadius: "20px",
      boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
      padding: "40px",
      textAlign: "center",
      border: "1px solid rgba(0,0,0,0.05)",
      display: "block", // 显式设置
      zIndex: 100,
    },
    logo: {
      width: "70px",
      height: "70px",
      backgroundColor: "#007aff",
      borderRadius: "16px",
      margin: "0 auto 24px auto",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      color: "white",
      fontSize: "30px",
      boxShadow: "0 8px 20px rgba(0, 122, 255, 0.25)",
    },
    title: {
      fontSize: "24px",
      fontWeight: "700",
      color: "#000",
      marginBottom: "8px",
    },
    subtitle: {
      fontSize: "14px",
      color: "#8e8e93",
      marginBottom: "32px",
    },
    inputWrapper: {
      marginBottom: "16px",
      textAlign: "left",
    },
    label: {
      fontSize: "12px",
      fontWeight: "600",
      color: "#8e8e93",
      marginBottom: "6px",
      display: "block",
      marginLeft: "4px",
    },
    input: {
      height: "44px",
      borderRadius: "10px",
      backgroundColor: "#f2f2f7",
      border: "1px solid rgba(0,0,0,0.05)",
      padding: "0 12px",
      fontSize: "16px",
    },
    button: {
      height: "44px",
      borderRadius: "10px",
      backgroundColor: "#007aff",
      border: "none",
      fontSize: "16px",
      fontWeight: "600",
      marginTop: "24px",
      boxShadow: "0 4px 12px rgba(0, 122, 255, 0.2)",
    },
    footer: {
      marginTop: "24px",
      fontSize: "14px",
      color: "#8e8e93",
    },
    link: {
      color: "#007aff",
      fontWeight: "500",
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <LockOutlined />
        </div>
        <h1 style={styles.title}>知识图谱安全系统</h1>
        <p style={styles.subtitle}>请登录以继续访问</p>

        <div onKeyDown={handleKeyDown}>
          <div style={styles.inputWrapper}>
            <label style={styles.label}>用户名</label>
            <Input
              placeholder="请输入用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.inputWrapper}>
            <label style={styles.label}>密码</label>
            <Input.Password
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
            />
          </div>

          <Button
            type="primary"
            block
            loading={loading}
            onClick={handleLogin}
            style={styles.button}
          >
            登录
          </Button>

          <div style={styles.footer}>
            还没有账号？ <a href="/register" style={styles.link}>立即注册</a>
          </div>
        </div>
      </div>
    </div>
  );
}