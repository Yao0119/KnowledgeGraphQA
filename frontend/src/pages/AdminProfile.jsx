import { useState, useEffect } from "react";
import { Card, Form, Input, Button, message, Spin, Row, Col, Statistic, Tag, Divider } from "antd";
import { ArrowLeftOutlined, SaveOutlined, WarningOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

import api, { getToken, getCurrentUser, errorMessage } from "../api";

export default function AdminProfile() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [stats, setStats] = useState(null);
  const [graphStats, setGraphStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!getToken() || !getCurrentUser()) {
      message.error("未登录，请先登录");
      navigate("/login");
      return;
    }

    // 以 /api/admin/profile 为准，而不是只依赖 localStorage 里的缓存
    // （原实现用 "admin@system.local" / "系统管理员" 作为兜底，会把假数据写进表单）。
    fetchProfile();
    fetchStats();
    fetchExtras();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await api.get("/api/admin/profile");
      const info = res.data ?? {};
      setUserInfo(info);
      form.setFieldsValue({
        username: info.username,
        email: info.email ?? "",
        full_name: info.full_name ?? "",
      });
    } catch (err) {
      message.error(errorMessage(err, "获取管理员资料失败"));
    }
  };

  /**
   * 获取账户统计
   *
   * 注意：/api/admin/stats 现在既接受 Authorization: Bearer <管理员 JWT>
   * 也接受 ?admin_token= 查询参数（见 backend/admin/routes.py 的 require_admin）。
   * 原实现只发 Authorization 头、而当时后端只认查询参数，于是必然 422。
   */
  const fetchStats = async () => {
    try {
      const res = await api.get("/api/admin/stats");
      setStats(res.data ?? null);
    } catch (err) {
      message.error(errorMessage(err, "获取系统统计数据失败"));
    }
  };

  /** 图谱规模与服务健康度（原来的 graph_count / system_status 字段后端并不存在） */
  const fetchExtras = async () => {
    try {
      const res = await api.get("/api/graph/summary");
      setGraphStats(res.data?.data ?? res.data ?? null);
    } catch (err) {
      console.warn("获取图谱统计失败:", err);
    }
    try {
      const res = await api.get("/api/health");
      setHealth(res.data ?? null);
    } catch (err) {
      console.warn("获取健康状态失败:", err);
    }
  };

  const handleSave = async (values) => {
    setLoading(true);
    try {
      const res = await api.put("/api/admin/profile", {
        email: values.email,
        full_name: values.full_name,
      });

      message.success("个人信息已更新");

      // 用接口返回的真实数据更新本地缓存，而不是把表单值原样合并进去
      const profile = res.data?.profile ?? {};
      const current = getCurrentUser() ?? {};
      localStorage.setItem("user", JSON.stringify({ ...current, ...profile }));

      setUserInfo((prev) => ({ ...prev, ...profile }));
      setIsEditing(false);
    } catch (err) {
      message.error(errorMessage(err, "更新个人信息失败"));
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (values) => {
    setPasswordLoading(true);
    try {
      await api.post("/api/admin/change-password", {
        current_password: values.current_password,
        new_password: values.new_password,
      });
      message.success("密码已修改，请重新登录");
      passwordForm.resetFields();
      setTimeout(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login");
      }, 1200);
    } catch (err) {
      message.error(errorMessage(err, "修改密码失败"));
    } finally {
      setPasswordLoading(false);
    }
  };

  if (!userInfo) {
    return (
      <div style={{ textAlign: "center", padding: "50px" }}>
        <Spin size="large" />
      </div>
    );
  }

  const styles = {
    container: {
      backgroundColor: "#f0f2f5",
      minHeight: "100vh",
      padding: "20px",
    },
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "30px",
    },
    title: {
      fontSize: "32px",
      fontWeight: "bold",
      color: "#001529",
      margin: 0,
    },
    card: {
      borderRadius: "10px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
    },
    section: {
      marginBottom: "30px",
    },
    sectionTitle: {
      fontSize: "18px",
      fontWeight: "600",
      marginBottom: "15px",
      color: "#444",
    },
    infoGroup: {
      marginBottom: "20px",
      padding: "15px",
      backgroundColor: "#f5f5f5",
      borderRadius: "8px",
    },
    label: {
      fontWeight: "600",
      color: "#666",
      marginBottom: "5px",
    },
    value: {
      fontSize: "16px",
      color: "#333",
    },
    statCard: {
      marginBottom: "20px",
      borderRadius: "8px",
    },
  };

  return (
    <div style={styles.container}>
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        {/* 头部 */}
        <div style={styles.header}>
          <h1 style={styles.title}>管理员个人资料</h1>
          <Button
            type="primary"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/")}
          >
            返回首页
          </Button>
        </div>

        {/* 基本信息卡片 */}
        <Card style={styles.card}>
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>账户信息（只读）</h3>
            
            <Row gutter={[20, 20]}>
              <Col xs={24} sm={12}>
                <div style={styles.infoGroup}>
                  <div style={styles.label}>用户名</div>
                  <div style={styles.value}>{userInfo.username}</div>                </div>
              </Col>
              <Col xs={24} sm={12}>
                <div style={styles.infoGroup}>
                  <div style={styles.label}>邮箱</div>
                  <div style={styles.value}>{userInfo.email || "-"}</div>
                </div>
              </Col>
              <Col xs={24} sm={12}>
                <div style={styles.infoGroup}>
                  <div style={styles.label}>姓名</div>
                  <div style={styles.value}>{userInfo.full_name || "-"}</div>
                </div>
              </Col>
              <Col xs={24} sm={12}>
                <div style={styles.infoGroup}>
                  <div style={styles.label}>角色</div>
                  <div style={styles.value}>
                    <Tag color="blue">系统管理员</Tag>
                  </div>
                </div>
              </Col>
            </Row>
          </div>

          <Divider />

          {/* 系统统计 */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>系统统计</h3>
            
            {stats ? (
              <Row gutter={[20, 20]}>
                <Col xs={24} sm={12} md={6}>
                  <Card style={styles.statCard}>
                    <Statistic
                      title="总用户数"
                      value={stats.total_users ?? 0}
                      valueStyle={{ color: "#1890ff" }}
                    />
                  </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                  <Card style={styles.statCard}>
                    <Statistic
                      title="客户用户"
                      value={stats.total_customers ?? 0}
                      valueStyle={{ color: "#52c41a" }}
                    />
                  </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                  <Card style={styles.statCard}>
                    <Statistic
                      title="图谱节点"
                      value={graphStats?.nodes ?? 0}
                      suffix={graphStats ? ` / ${graphStats.relationships ?? 0} 关系` : ""}
                      valueStyle={{ color: "#faad14" }}
                    />
                  </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                  <Card style={styles.statCard}>
                    <Statistic
                      title="系统状态"
                      value={health?.overall === "healthy" ? "正常" : (health?.overall ?? "未知")}
                      valueStyle={{ color: health?.overall === "healthy" ? "#52c41a" : "#ff4d4f" }}
                    />
                  </Card>
                </Col>
              </Row>
            ) : (
              <p style={{ color: "#999" }}>加载统计数据中...</p>
            )}
          </div>

          <Divider />

          {/* 可编辑信息 */}
          <div style={styles.section}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ ...styles.sectionTitle, margin: 0 }}>编辑个人信息</h3>
              <Button
                type={isEditing ? "default" : "primary"}
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? "取消编辑" : "编辑信息"}
              </Button>
            </div>

            <Form
              form={form}
              layout="vertical"
              onFinish={handleSave}
              disabled={!isEditing}
            >
              <Row gutter={[20, 0]}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="邮箱地址"
                    name="email"
                    rules={[
                      { required: true, message: "请输入邮箱" },
                      { type: "email", message: "邮箱格式不正确" },
                    ]}
                  >
                    <Input placeholder="输入邮箱地址" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="姓名"
                    name="full_name"
                    rules={[{ required: true, message: "请输入姓名" }]}
                  >
                    <Input placeholder="输入姓名" />
                  </Form.Item>
                </Col>
              </Row>

              {isEditing && (
                <Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<SaveOutlined />}
                    loading={loading}
                    block
                    style={{ height: "40px", fontWeight: "bold" }}
                  >
                    保存更改
                  </Button>
                </Form.Item>
              )}
            </Form>
          </div>

          <Divider />

          {/* 安全设置 */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              <WarningOutlined style={{ marginRight: "8px", color: "#ff4d4f" }} />
              账户安全
            </h3>
            
            {/* 原来的表单既没有 onFinish，Input 也没有 name 属性，
                连输入值都收集不到，"修改密码"按钮点了什么都不会发生。
                现在接到 POST /api/admin/change-password。 */}
            <Form form={passwordForm} layout="vertical" onFinish={handleChangePassword}>
              <Row gutter={[20, 0]}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="当前密码"
                    name="current_password"
                    rules={[{ required: true, message: "请输入当前密码" }]}
                  >
                    <Input.Password placeholder="输入当前密码" autoComplete="current-password" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="新密码"
                    name="new_password"
                    rules={[
                      { required: true, message: "请输入新密码" },
                      { min: 6, message: "密码至少 6 位" },
                    ]}
                  >
                    <Input.Password placeholder="输入新密码" autoComplete="new-password" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={[20, 0]}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="确认新密码"
                    name="confirm_password"
                    dependencies={["new_password"]}
                    rules={[
                      { required: true, message: "请确认新密码" },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue("new_password") === value) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error("两次输入的新密码不一致"));
                        },
                      }),
                    ]}
                  >
                    <Input.Password placeholder="确认新密码" autoComplete="new-password" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label=" ">
                    <Button
                      type="default"
                      danger
                      block
                      htmlType="submit"
                      loading={passwordLoading}
                      style={{ marginTop: "4px" }}
                    >
                      修改密码
                    </Button>
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </div>
        </Card>
      </div>
    </div>
  );
}
