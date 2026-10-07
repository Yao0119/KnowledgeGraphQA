import { useState, useEffect } from "react";
import { Table, Button, Modal, message, Input, Space, Spin, Card, Form, Divider } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";

import api, { errorMessage } from "../api";

export default function AdminCustomerManagement() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editForm] = Form.useForm();
  const [isEditing, setIsEditing] = useState(false);

  // 原来这里硬编码了后端当时的默认管理员令牌，并放在
  // URL 查询参数里 —— 管理员密钥会进入浏览器历史与服务端访问日志。
  // 现在统一使用登录后拿到的 JWT：后端 require_admin 会校验 Authorization: Bearer
  // 且角色必须是 admin（见 backend/admin/routes.py）。
  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/admin/customers");
      setCustomers(res.data || []);
    } catch (err) {
      message.error(errorMessage(err, "加载客户列表失败"));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = async (record) => {
    try {
      const res = await api.get(`/api/admin/customers/${record.id}`);
      setSelectedCustomer(res.data);
      editForm.setFieldsValue({
        username: res.data.username,
        email: res.data.email,
        fullName: res.data.full_name,
        phone: res.data.phone,
        address: res.data.address,
        company: res.data.company,
        department: res.data.department,
      });
      setIsEditing(false);
      setIsModalVisible(true);
    } catch (err) {
      message.error(errorMessage(err, "加载客户详情失败"));
    }
  };

  const handleSaveCustomer = async (values) => {
    try {
      await api.put(`/api/admin/customers/${selectedCustomer.id}/update-profile`, {
        phone: values.phone,
        address: values.address,
        company: values.company,
        department: values.department,
      });
      message.success("客户信息已更新");
      setIsEditing(false);
      setIsModalVisible(false);
      fetchCustomers();
    } catch (err) {
      message.error(errorMessage(err, "更新失败"));
    }
  };

  const handleDeleteCustomer = (record) => {
    Modal.confirm({
      title: "删除客户",
      content: `确定要删除客户 "${record.username}" 吗？此操作不可撤销。`,
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        try {
          await api.delete(`/api/admin/customers/${record.id}`);
          message.success("客户已删除");
          fetchCustomers();
        } catch (err) {
          message.error(errorMessage(err, "删除失败"));
        }
      },
    });
  };

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.username?.toLowerCase().includes(searchText.toLowerCase()) ||
      customer.email?.toLowerCase().includes(searchText.toLowerCase())
  );

  const columns = [
    {
      title: "用户ID",
      dataIndex: "id",
      key: "id",
      width: 80,
    },
    {
      title: "用户名",
      dataIndex: "username",
      key: "username",
      render: (text) => <span style={{ fontWeight: 600 }}>{text}</span>,
    },
    {
      title: "邮箱",
      dataIndex: "email",
      key: "email",
    },
    {
      title: "姓名",
      dataIndex: "full_name",
      key: "full_name",
    },
    {
      title: "电话",
      dataIndex: "phone",
      key: "phone",
      render: (text) => text || "-",
    },
    {
      title: "公司",
      dataIndex: "company",
      key: "company",
      render: (text) => text || "-",
    },
    {
      title: "操作",
      key: "action",
      width: 150,
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            编辑
          </Button>
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteCustomer(record)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const styles = {
    container: {
      padding: "30px",
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "20px",
    },
    title: {
      fontSize: "24px",
      fontWeight: "bold",
      margin: 0,
    },
    searchBox: {
      width: "250px",
    },
  };

  return (
    <div style={styles.container}>
      <Card style={{ borderRadius: "10px", boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
        {/* 头部 */}
        <div style={styles.header}>
          <h2 style={styles.title}>客户管理</h2>
          <Space>
            <Input
              placeholder="搜索用户名或邮箱"
              prefix={<SearchOutlined />}
              style={styles.searchBox}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            {/* 后端没有"管理员新建客户"接口（只有注册与删除），
                原先这个按钮没有 onClick，是个点了没反应的死 UI。
                这里改为跳转到注册页，行为与能力对齐。 */}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => window.open("/register", "_blank", "noopener")}
              title="客户需要通过注册页自助创建"
            >
              新增客户
            </Button>
          </Space>
        </div>

        {/* 统计信息 */}
        <div style={{ marginBottom: "20px", padding: "15px", backgroundColor: "#f0f2f5", borderRadius: "8px" }}>
          <span style={{ marginRight: "30px" }}>
            <strong>总客户数：</strong> {customers.length}
          </span>
        </div>

        {/* 表格 */}
        <Spin spinning={loading}>
          <Table
            columns={columns}
            dataSource={filteredCustomers}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            bordered
          />
        </Spin>
      </Card>

      {/* 编辑模态框 */}
      <Modal
        title={`编辑客户信息 - ${selectedCustomer?.username}`}
        open={isModalVisible}
        width={600}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
      >
        <div>
            {/* 只读信息 */}
            <div style={{ marginBottom: "20px", padding: "15px", backgroundColor: "#f5f5f5", borderRadius: "8px" }}>
              <div style={{ marginBottom: "10px" }}>
                <span style={{ fontWeight: 600 }}>用户名：</span> {selectedCustomer?.username}
              </div>
              <div style={{ marginBottom: "10px" }}>
                <span style={{ fontWeight: 600 }}>邮箱：</span> {selectedCustomer?.email}
              </div>
              <div>
                <span style={{ fontWeight: 600 }}>注册时间：</span>{" "}
                {selectedCustomer?.created_at
                  ? new Date(selectedCustomer.created_at).toLocaleDateString()
                  : "-"}
              </div>
            </div>

            <Divider />

            {/* 编辑表单 */}
            <Form
              form={editForm}
              layout="vertical"
              onFinish={handleSaveCustomer}
            >
              <Form.Item
                label="姓名"
                name="fullName"
              >
                <Input disabled placeholder="姓名" />
              </Form.Item>

              <Form.Item
                label="电话"
                name="phone"
              >
                <Input
                  disabled={!isEditing}
                  placeholder="输入电话号码"
                />
              </Form.Item>

              <Form.Item
                label="地址"
                name="address"
              >
                <Input
                  disabled={!isEditing}
                  placeholder="输入地址"
                />
              </Form.Item>

              <Form.Item
                label="公司"
                name="company"
              >
                <Input
                  disabled={!isEditing}
                  placeholder="输入公司名称"
                />
              </Form.Item>

              <Form.Item
                label="部门"
                name="department"
              >
                <Input
                  disabled={!isEditing}
                  placeholder="输入部门名称"
                />
              </Form.Item>

              <div style={{ display: "flex", gap: "10px" }}>
                {!isEditing ? (
                  <>
                    <Button
                      type="primary"
                      block
                      onClick={() => setIsEditing(true)}
                    >
                      编辑信息
                    </Button>
                    <Button
                      block
                      onClick={() => setIsModalVisible(false)}
                    >
                      关闭
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="primary"
                      block
                      htmlType="submit"
                    >
                      保存更改
                    </Button>
                    <Button
                      block
                      onClick={() => setIsEditing(false)}
                    >
                      取消
                    </Button>
                  </>
                )}
              </div>
            </Form>
        </div>
      </Modal>
    </div>
  );
}
