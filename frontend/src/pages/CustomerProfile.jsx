import { useState, useEffect } from "react";
import { Form, Input, Button, message, Card, Spin, Row, Col, Divider } from "antd";
import { ArrowLeftOutlined, SaveOutlined, PhoneOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

import api, { getToken, getCurrentUser, errorMessage } from "../api";

export default function CustomerProfile() {
  const navigate = useNavigate();
  const [editForm] = Form.useForm();
  const [userData, setUserData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      message.error("请先登录");
      navigate("/login");
      return;
    }
    fetchUserData();
  }, []);

  /**
   * 读取当前客户资料
   *
   * 原实现有两个问题：
   *   1. 对 localhost / 127.0.0.1 / 0.0.0.0 三个地址轮询（0.0.0.0 作为客户端目标非法），
   *      一次请求变三次，真实错误只打在 console 里；
   *   2. 请求 /api/customer/profile 却按 res.data.profile.* / res.data.user.* 读取，
   *      而该接口返回的是**扁平的 snake_case** 结构，于是表单和账户信息永远是空的。
   * 现在改用 /api/customer/info（同时包含用户信息与资料），并适配扁平结构。
   */
  const fetchUserData = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/customer/info");
      const info = res.data ?? {};

      setUserData({
        user: {
          id: info.user_id,
          username: info.username,
          email: info.email,
          created_at: info.created_at,
        },
        profile: {
          fullName: info.full_name ?? "",
          phone: info.phone ?? "",
          address: info.address ?? "",
          company: info.company ?? "",
          department: info.department ?? "",
        },
      });

      editForm.setFieldsValue({
        fullName: info.full_name ?? "",
        phone: info.phone ?? "",
        address: info.address ?? "",
        company: info.company ?? "",
        department: info.department ?? "",
      });
    } catch (err) {
      message.error(errorMessage(err, "获取用户信息失败"));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values) => {
    setEditLoading(true);
    try {
      // 后端 CustomerProfileUpdateRequest 的字段是 snake_case（full_name），
      // 原先发送的是 camelCase 的 fullName，姓名因此永远保存不上。
      await api.put("/api/customer/profile", {
        full_name: values.fullName,
        phone: values.phone,
        address: values.address,
        company: values.company,
        department: values.department,
      });

      message.success("个人信息已更新");
      setIsEditing(false);

      // 用可安全解析的方式更新本地缓存。
      // 原先直接 JSON.parse(localStorage.getItem("user"))，
      // 当 "user" 是历史脏数据 "undefined" 时会抛异常并被下一层 catch 吞掉。
      const current = getCurrentUser();
      if (current) {
        localStorage.setItem(
          "user",
          JSON.stringify({ ...current, full_name: values.fullName, fullName: values.fullName })
        );
      }

      await fetchUserData();
    } catch (err) {
      message.error(errorMessage(err, "更新个人信息失败"));
    } finally {
      setEditLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "50px" }}>
        <Spin size="large" />
      </div>
    );
  }

  const styles = {
    container: {
      backgroundColor: "var(--c-surface2)",
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
      color: "var(--c-fg)",
      margin: 0,
    },
    card: {
      borderRadius: "var(--radius-lg)",
      boxShadow: "none",
    },
    section: {
      marginBottom: "30px",
    },
    sectionTitle: {
      fontSize: "18px",
      fontWeight: "600",
      marginBottom: "15px",
      color: "var(--c-fg)",
    },
    infoGroup: {
      marginBottom: "20px",
      padding: "15px",
      backgroundColor: "var(--c-surface2)",
      borderRadius: "var(--radius-md)",
    },
    label: {
      fontWeight: "600",
      color: "var(--c-fg-muted)",
      marginBottom: "5px",
    },
    value: {
      fontSize: "16px",
      color: "var(--c-fg)",
    },
  };

  return (
    <div style={styles.container}>
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        {/* 头部 */}
        <div style={styles.header}>
          <h1 style={styles.title}>个人资料管理</h1>
          <Button
            type="primary"
            // href 让 antd 渲染成真正的 <a>：键盘可达、支持中键与新标签；
            // onClick 里 preventDefault 再走 SPA 路由，避免整页刷新。
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
            icon={<ArrowLeftOutlined aria-hidden="true" />}
          >
            返回首页
          </Button>
        </div>

        {/* 基本信息卡片 */}
        <Card style={styles.card}>
          {userData && (
            <>
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>账户信息（只读）</h3>

                <Row gutter={[20, 20]}>
                  <Col xs={24} sm={12}>
                    <div style={styles.infoGroup}>
                      <div style={styles.label}>用户名</div>
                      <div style={styles.value}>{userData.user?.username}</div>
                    </div>
                  </Col>
                  <Col xs={24} sm={12}>
                    <div style={styles.infoGroup}>
                      <div style={styles.label}>邮箱</div>
                      <div style={styles.value}>{userData.user?.email}</div>
                    </div>
                  </Col>
                  <Col xs={24} sm={12}>
                    <div style={styles.infoGroup}>
                      <div style={styles.label}>用户ID</div>
                      <div style={styles.value}>{userData.user?.id}</div>
                    </div>
                  </Col>
                  <Col xs={24} sm={12}>
                    <div style={styles.infoGroup}>
                      <div style={styles.label}>注册时间</div>
                      <div style={styles.value}>
                        {userData.user?.created_at ? new Date(userData.user.created_at).toLocaleDateString() : "-"}
                      </div>
                    </div>
                  </Col>
                </Row>
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
                  form={editForm}
                  layout="vertical"
                  onFinish={handleSave}
                  disabled={!isEditing}
                >
                  <Row gutter={[20, 0]}>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        label="姓名"
                        name="fullName"
                      >
                        <Input placeholder="输入您的姓名" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        label="联系电话"
                        name="phone"
                      >
                        <Input
                          prefix={<PhoneOutlined />}
                          placeholder="输入联系电话"
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={[20, 0]}>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        label="地址"
                        name="address"
                      >
                        <Input placeholder="输入您的地址" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        label="公司"
                        name="company"
                      >
                        <Input placeholder="输入公司名称" />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item
                    label="部门"
                    name="department"
                  >
                    <Input placeholder="输入部门名称" />
                  </Form.Item>

                  {isEditing && (
                    <Form.Item>
                      <Button
                        type="primary"
                        htmlType="submit"
                        icon={<SaveOutlined />}
                        block
                        loading={editLoading}
                        style={{ height: "40px", fontWeight: "bold" }}
                      >
                        保存更改
                      </Button>
                    </Form.Item>
                  )}
                </Form>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
