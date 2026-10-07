/**
 * Dashboard 主页面
 * 显示系统主界面，包含导航栏、侧边栏和内容区域
 */

import { useState, useEffect } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { Layout, Avatar, Dropdown, Modal, Tooltip, Button, Space, Statistic, Row, Col, Card, message } from "antd";
import { LogoutOutlined, UserOutlined, HomeOutlined, BellOutlined, SettingOutlined } from "@ant-design/icons";
import Sidebar from "../components/Sidebar";
import LLMSettingsModal from "../components/LLMSettingsModal";
import { API_BASE } from "../api";

const { Header, Content, Sider } = Layout;

export default function Dashboard() {
    const navigate = useNavigate();
    const [userInfo, setUserInfo] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [stats, setStats] = useState(null);
    const [collapsed, setCollapsed] = useState(false);
    // 系统设置弹窗（配置大模型 API Key）
    const [settingsOpen, setSettingsOpen] = useState(false);

    useEffect(() => {
        // 从 localStorage 读取用户信息
        const user = localStorage.getItem("user");
        const token = localStorage.getItem("token");

        if (!token || !user) {
            navigate("/login");
            return;
        }

        try {
            const userData = JSON.parse(user);
            setUserInfo(userData);
            setIsAdmin(userData.role === "admin");
        } catch (err) {
            console.error("用户信息解析失败:", err);
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            localStorage.removeItem("isAdmin");
            navigate("/login");
        }

        // 获取系统统计信息
        fetchStats();
    }, [navigate]);

    const fetchStats = async () => {
        try {
            // 走统一基址：默认相对路径，由 Vite 代理转发（见 src/api.js 与 vite.config.mjs）
            const response = await fetch(`${API_BASE}/api/health`);
            const data = await response.json();
            setStats(data);
        } catch (err) {
            console.error("获取统计信息失败:", err);
        }
    };

    const handleLogout = () => {
        Modal.confirm({
            title: "确认退出",
            content: "确定要退出登录吗？",
            okText: "确认",
            cancelText: "取消",
            onOk() {
                localStorage.removeItem("token");
                localStorage.removeItem("user");
                localStorage.removeItem("isAdmin");
                localStorage.removeItem("role");
                navigate("/login");
            },
        });
    };

    const handleProfileClick = () => {
        if (isAdmin) {
            navigate("/admin-profile");
        } else {
            navigate("/customer-profile");
        }
    };

    const handleMenuClick = ({ key }) => {
        if (key === "profile") {
            handleProfileClick();
        } else if (key === "logout") {
            handleLogout();
        } else if (key === "settings") {
            setSettingsOpen(true);
        }
    };

    const headerMenuItems = [
        {
            key: "profile",
            label: "个人资料",
            icon: <UserOutlined/>,
        },
        {
            type: "divider",
        },
        {
            key: "settings",
            label: "系统设置",
            icon: <SettingOutlined/>,
        },
        {
            key: "logout",
            label: "退出登录",
            icon: <LogoutOutlined/>,
            danger: true,
        },
    ];

    if (!userInfo) {
        return null;
    }

    // 当前 LLM 后端状态：新接口返回 stats.llm（并附带 provider/model），
    // 旧接口只有 stats.ollama，这里做兼容读取
    const llmStatus = stats?.llm ?? stats?.ollama;

    return (
        <Layout style={{minHeight: "100vh", backgroundColor: "#f2f2f7"}}>
            {/* 顶部 Header - iOS 风格 */}
            <Header
                style={{
                    background: "rgba(255, 255, 255, 0.7)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    padding: "0 24px",
                    borderBottom: "1px solid rgba(0,0,0,0.05)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    position: "sticky",
                    top: 0,
                    zIndex: 1001, // 提高层级，确保在侧边栏之上
                    height: 60,
                }}
            >
                {/* 左侧 - Logo/标题 - 点击跳转主页 */}
                <div 
                    onClick={() => navigate("/dashboard")}
                    style={{
                        display: "flex", 
                        alignItems: "center", 
                        gap: 12, 
                        cursor: "pointer",
                        padding: "4px 8px",
                        borderRadius: "8px",
                        transition: "background-color 0.2s"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.03)"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                    <div style={{
                        width: 32, 
                        height: 32, 
                        backgroundColor: "#007aff", 
                        borderRadius: 8, 
                        display: "flex", 
                        justifyContent: "center", 
                        alignItems: "center",
                        boxShadow: "0 4px 10px rgba(0, 122, 255, 0.3)"
                    }}>
                        <HomeOutlined style={{fontSize: 18, color: "#fff"}}/>
                    </div>
                    <h2 style={{color: "#000", margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.5px"}}>
                        知识图谱安全中心
                    </h2>
                </div>

                {/* 右侧 - 用户菜单和按钮 */}
                <Space size={16} style={{display: "flex", alignItems: "center"}}>
                    {/* 通知按钮（原先 navigate("/notifications") 没有对应路由，
                        会被 * 通配符重定向回首页，看起来像"点了没反应"）*/}
                    <Tooltip title="通知">
                        <Button
                            type="text"
                            shape="circle"
                            icon={<BellOutlined style={{fontSize: 18, color: "#8e8e93"}}/>}
                            onClick={() => message.info("暂无新通知")}
                        />
                    </Tooltip>

                    {/* 系统设置按钮：填写调用大模型所需的 API Key */}
                    <Tooltip title="系统设置（大模型 API Key）">
                        <Button
                            type="text"
                            shape="circle"
                            icon={<SettingOutlined style={{fontSize: 18, color: "#8e8e93"}}/>}
                            onClick={() => setSettingsOpen(true)}
                        />
                    </Tooltip>

                    {/* 用户头像和下拉菜单 - 改为悬停触发 */}
                    <Dropdown
                        menu={{ items: headerMenuItems, onClick: handleMenuClick }}
                        trigger={["hover"]}
                        placement="bottomRight"
                        overlayStyle={{ zIndex: 1100 }}
                    >
                        <Space
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                cursor: "pointer",
                                padding: "4px 12px",
                                borderRadius: 12,
                                transition: "all 0.2s",
                                userSelect: "none",
                                backgroundColor: "rgba(0,0,0,0.03)"
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.06)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.03)";
                            }}
                        >
                            <Avatar
                                style={{
                                    backgroundColor: "#007aff",
                                    boxShadow: "0 2px 4px rgba(0,122,255,0.2)",
                                }}
                                size={30}
                                icon={<UserOutlined/>}
                            />
                            <span style={{color: "#000", fontSize: 14, fontWeight: 600}}>
                                {userInfo?.username || "用户"}
                            </span>
                        </Space>
                    </Dropdown>
                </Space>
            </Header>

            <Layout style={{flex: 1, backgroundColor: "transparent", paddingTop: 60}}>
                {/* 侧边栏 - 固定位置 */}
                <Sider
                    collapsible
                    collapsed={collapsed}
                    onCollapse={setCollapsed}
                    theme="light"
                    width={240}
                    collapsedWidth={80}
                    style={{
                        background: "rgba(255, 255, 255, 0.5)",
                        backdropFilter: "blur(10px)",
                        borderRight: "1px solid rgba(0,0,0,0.05)",
                        overflow: 'auto',
                        height: 'calc(100vh - 60px)',
                        position: 'fixed',
                        left: 0,
                        top: 60,
                        zIndex: 1000,
                    }}
                >
                    <Sidebar isAdmin={isAdmin}/>
                </Sider>

                {/* 主内容区域 - 增加左侧边距以避开固定的侧边栏 */}
                <Layout style={{ 
                    marginLeft: collapsed ? 80 : 240, 
                    transition: 'all 0.2s',
                    backgroundColor: 'transparent',
                    minHeight: 'calc(100vh - 60px)'
                }}>
                    <Content
                        style={{
                            margin: "24px",
                            padding: "0",
                            minHeight: 280,
                        }}
                    >
                    {/* 顶部统计卡片 */}
                    {stats && (
                        <Row gutter={20} style={{marginBottom: 24}}>
                            <Col xs={24} sm={12} md={6}>
                                <Card
                                    bordered={false}
                                    style={{
                                        borderRadius: 16,
                                        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                                        backgroundColor: "#fff"
                                    }}
                                >
                                    <Statistic
                                        title={<span style={{color: "#8e8e93", fontSize: 13, fontWeight: 500}}>服务状态</span>}
                                        value={stats.overall === "healthy" ? "正常" : "异常"}
                                        valueStyle={{color: stats.overall === "healthy" ? "#34c759" : "#ff3b30", fontSize: 20, fontWeight: 700}}
                                        prefix={<div style={{width: 8, height: 8, borderRadius: "50%", backgroundColor: stats.overall === "healthy" ? "#34c759" : "#ff3b30", display: "inline-block", marginRight: 8}} />}
                                    />
                                </Card>
                            </Col>
                            <Col xs={24} sm={12} md={6}>
                                <Card
                                    bordered={false}
                                    style={{
                                        borderRadius: 16,
                                        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                                        backgroundColor: "#fff"
                                    }}
                                >
                                    <Statistic
                                        title={<span style={{color: "#8e8e93", fontSize: 13, fontWeight: 500}}>数据库连接</span>}
                                        value={stats.neo4j === "connected" ? "已连接" : "未连接"}
                                        valueStyle={{color: stats.neo4j === "connected" ? "#007aff" : "#ff3b30", fontSize: 20, fontWeight: 700}}
                                        prefix={stats.neo4j === "connected" ? "✓" : "✗"}
                                    />
                                </Card>
                            </Col>
                            <Col xs={24} sm={12} md={6}>
                                <Card
                                    bordered={false}
                                    style={{
                                        borderRadius: 16,
                                        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                                        backgroundColor: "#fff"
                                    }}
                                >
                                    <Statistic
                                        title={
                                            <span style={{color: "#8e8e93", fontSize: 13, fontWeight: 500}}>
                                                {stats.llm_provider === "deepseek" ? "DeepSeek API" : "Ollama LLM"}
                                                {stats.llm_model ? ` · ${stats.llm_model}` : ""}
                                            </span>
                                        }
                                        value={llmStatus === "connected" ? "已连接" : "未连接"}
                                        valueStyle={{color: llmStatus === "connected" ? "#007aff" : "#ff3b30", fontSize: 20, fontWeight: 700}}
                                        prefix={llmStatus === "connected" ? "✓" : "✗"}
                                    />
                                    {llmStatus !== "connected" && stats.llm_reason && (
                                        <div style={{marginTop: 4, fontSize: 12, color: "#ff3b30"}}>
                                            {stats.llm_reason}
                                        </div>
                                    )}
                                </Card>
                            </Col>
                            <Col xs={24} sm={12} md={6}>
                                <Card
                                    bordered={false}
                                    style={{
                                        borderRadius: 16,
                                        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                                        backgroundColor: "#fff"
                                    }}
                                >
                                    <Statistic
                                        title={<span style={{color: "#8e8e93", fontSize: 13, fontWeight: 500}}>MySQL</span>}
                                        value={stats.mysql === "connected" ? "已连接" : "未连接"}
                                        valueStyle={{color: stats.mysql === "connected" ? "#007aff" : "#ff3b30", fontSize: 20, fontWeight: 700}}
                                        prefix={stats.mysql === "connected" ? "✓" : "✗"}
                                    />
                                </Card>
                            </Col>
                        </Row>
                    )}

                    {/* 页面内容 - 由子路由填充 */}
                    <Outlet/>
                </Content>
            </Layout>
        </Layout>

            {/* 系统设置弹窗：运行时配置大模型 API Key（保存即生效并同步写入 .env） */}
            <LLMSettingsModal
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                onSaved={fetchStats}
            />
    </Layout>
    );
}
