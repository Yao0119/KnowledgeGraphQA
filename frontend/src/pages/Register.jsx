import { useState } from "react";
import { Input, Button, message, Form, Steps, Spin } from "antd";
import { UserOutlined, LockOutlined, MailOutlined, PhoneOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

import api, { setSession, errorMessage } from "../api";

export default function Register() {
  const [current, setCurrent] = useState(0); // 0: 基本信息, 1: 详细信息
  const [loading, setLoading] = useState(false);
  const [form1Data, setForm1Data] = useState({ username: "", email: "", password: "", confirmPassword: "" });
  const [form2Data, setForm2Data] = useState({ fullName: "", phone: "", address: "", company: "" });
  const navigate = useNavigate();

  const handleRegisterStep1 = () => {
    if (!form1Data.username || !form1Data.email || !form1Data.password) {
      message.warning("请填写所有必填项");
      return;
    }
    if (form1Data.password !== form1Data.confirmPassword) {
      message.error("两次输入的密码不一致");
      return;
    }
    if (form1Data.password.length < 6) {
      message.error("密码至少6个字符");
      return;
    }
    setCurrent(1);
  };

  const handleRegisterStep2 = async () => {
    setLoading(true);
    try {
      // 注意：/api/auth/register 的响应是 {success, message, user_id, username}，
      // **不包含 access_token 和 user**。原实现照抄了登录页的写法，
      // 于是把字符串 "undefined" 写进了 localStorage（真值，能骗过路由守卫，
      // 但之后所有带 Bearer 的请求都会失败，且 user 的 JSON.parse 会抛异常）。
      // 这里改为：注册成功后显式调用一次登录接口来获取真正的 JWT。
      await api.post("/api/auth/register", {
        username: form1Data.username,
        email: form1Data.email,
        password: form1Data.password,
        full_name: form2Data.fullName || form1Data.username,
      });

      const loginRes = await api.post("/api/auth/login", {
        username: form1Data.username,
        password: form1Data.password,
      });
      setSession({
        token: loginRes.data.access_token,
        user: loginRes.data.user,
      });

      // 注册接口本身不接收电话/地址/公司，第二步收集的信息在这里通过资料接口补写。
      // 失败不影响注册结果，仅提示。
      const extra = {
        phone: form2Data.phone || undefined,
        address: form2Data.address || undefined,
        company: form2Data.company || undefined,
      };
      if (extra.phone || extra.address || extra.company) {
        try {
          await api.put("/api/customer/profile", extra);
        } catch (profileErr) {
          console.warn("补充个人资料失败:", profileErr);
          message.warning("账户已创建，但补充资料保存失败，可稍后在个人中心填写");
        }
      }

      message.success("注册成功，正在跳转...");
      setTimeout(() => {
        navigate("/customer/profile");
      }, 1000);
    } catch (err) {
      message.error(errorMessage(err, "注册失败，请稍后重试"));
      setCurrent(0); // 返回第一步
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    container: {
      minHeight: "100vh",
      width: "100vw",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "var(--c-surface2)",
      padding: "20px",
    },
    card: {
      width: "600px",
      maxWidth: "100%",
      backgroundColor: "var(--c-surface)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "0 15px 40px rgba(0,0,0,0.15)",
      padding: "40px",
    },
    title: {
      fontSize: "28px",
      fontWeight: "bold",
      color: "var(--c-fg)",
      marginBottom: "10px",
      textAlign: "center",
    },
    subtitle: {
      color: "var(--c-fg-faint)",
      marginBottom: "30px",
      textAlign: "center",
    },
    inputStyle: {
      height: "40px",
      borderRadius: "var(--radius-md)",
    },
    btnStyle: {
      height: "40px",
      borderRadius: "var(--radius-md)",
      marginTop: "20px",
      fontWeight: "bold",
    },
    formGroup: {
      marginBottom: "15px",
    },
    label: {
      display: "block",
      marginBottom: "6px",
      color: "var(--c-fg-muted)",
      fontSize: "13px",
      fontWeight: "500",
    },
  };

  return (
    <div style={styles.container}>
      <Spin spinning={loading} size="large">
        <div style={styles.card}>
          <h2 style={styles.title}>用户注册</h2>
          <p style={styles.subtitle}>创建您的账号以开始使用系统</p>

          <Steps
            current={current}
            items={[
              { title: "基本信息" },
              { title: "详细资料" },
            ]}
            style={{ marginBottom: "30px" }}
          />

          {current === 0 ? (
            <div>
              <div style={styles.formGroup}>
                <label style={styles.label}>用户名 *</label>
                <Input
                  prefix={<UserOutlined style={{ color: "var(--c-fg-faint)" }} />}
                  placeholder="输入用户名"
                  value={form1Data.username}
                  onChange={(e) => setForm1Data({ ...form1Data, username: e.target.value })}
                  style={styles.inputStyle}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>邮箱 *</label>
                <Input
                  prefix={<MailOutlined style={{ color: "var(--c-fg-faint)" }} />}
                  type="email"
                  placeholder="输入邮箱地址"
                  value={form1Data.email}
                  onChange={(e) => setForm1Data({ ...form1Data, email: e.target.value })}
                  style={styles.inputStyle}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>密码 *</label>
                <Input.Password
                  prefix={<LockOutlined style={{ color: "var(--c-fg-faint)" }} />}
                  placeholder="至少6个字符"
                  value={form1Data.password}
                  onChange={(e) => setForm1Data({ ...form1Data, password: e.target.value })}
                  style={styles.inputStyle}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>确认密码 *</label>
                <Input.Password
                  prefix={<LockOutlined style={{ color: "var(--c-fg-faint)" }} />}
                  placeholder="再次输入密码"
                  value={form1Data.confirmPassword}
                  onChange={(e) => setForm1Data({ ...form1Data, confirmPassword: e.target.value })}
                  style={styles.inputStyle}
                />
              </div>

              <Button
                type="primary"
                block
                onClick={handleRegisterStep1}
                style={styles.btnStyle}
              >
                下一步
              </Button>

              <div style={{ marginTop: "20px", textAlign: "center", color: "var(--c-fg-faint)" }}>
                已有账号？ <a href="/login" style={{ color: "var(--c-primary)" }}>返回登录</a>
              </div>
            </div>
          ) : (
            <div>
              <div style={styles.formGroup}>
                <label style={styles.label}>姓名</label>
                <Input
                  placeholder="输入您的姓名"
                  value={form2Data.fullName}
                  onChange={(e) => setForm2Data({ ...form2Data, fullName: e.target.value })}
                  style={styles.inputStyle}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>联系电话</label>
                <Input
                  prefix={<PhoneOutlined style={{ color: "var(--c-fg-faint)" }} />}
                  placeholder="输入联系电话"
                  value={form2Data.phone}
                  onChange={(e) => setForm2Data({ ...form2Data, phone: e.target.value })}
                  style={styles.inputStyle}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>地址</label>
                <Input
                  placeholder="输入您的地址"
                  value={form2Data.address}
                  onChange={(e) => setForm2Data({ ...form2Data, address: e.target.value })}
                  style={styles.inputStyle}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>公司</label>
                <Input
                  placeholder="输入公司名称"
                  value={form2Data.company}
                  onChange={(e) => setForm2Data({ ...form2Data, company: e.target.value })}
                  style={styles.inputStyle}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <Button
                  block
                  onClick={() => setCurrent(0)}
                  style={{ height: "40px", borderRadius: "var(--radius-md)" }}
                >
                  上一步
                </Button>
                <Button
                  type="primary"
                  block
                  loading={loading}
                  onClick={handleRegisterStep2}
                  style={{ height: "40px", borderRadius: "var(--radius-md)", fontWeight: "bold" }}
                >
                  完成注册
                </Button>
              </div>

              <div style={{ marginTop: "20px", textAlign: "center", color: "var(--c-fg-faint)", fontSize: "12px" }}>
                注册后您可以随时编辑这些信息
              </div>
            </div>
          )}
        </div>
      </Spin>
    </div>
  );
}
