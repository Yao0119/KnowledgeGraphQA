/**
 * Dashboard 主页面 —— 应用外壳
 *
 * 布局（按用户指定的方向）：
 *   - **取消顶部栏**，参考 ChatGPT 网页版：导航与账号全部收进左侧浮层
 *   - 侧边栏**悬浮**：距窗口四边 12px，大圆角 + 毛玻璃 + 浮起投影
 *   - 用户中心与系统设置放在侧边栏**左下角**
 *   - 通知只保留**右上角一个按钮**（悬浮毛玻璃圆形按钮）
 *   - 主题白灰黑单色；除图谱节点颜色外不引入杂色
 */

import { useState, useEffect } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { Modal, Tooltip, Button, message } from "antd";
import {
    LogoutOutlined,
    UserOutlined,
    BellOutlined,
} from "@ant-design/icons";
import Sidebar from "../components/Sidebar";
import LLMSettingsModal from "../components/LLMSettingsModal";

export default function Dashboard() {
    const navigate = useNavigate();
    const [userInfo, setUserInfo] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
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
    }, [navigate]);

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

    // 账号下拉菜单（挂在侧边栏左下角的用户行上）
    const userMenuItems = [
        {
            key: "profile",
            label: isAdmin ? "个人资料" : "我的资料",
            icon: <UserOutlined />,
        },
        { type: "divider" },
        {
            key: "logout",
            label: "退出登录",
            icon: <LogoutOutlined />,
            danger: true,
        },
    ];

    if (!userInfo) {
        return null;
    }

    return (
        <div style={{ minHeight: "100vh" }}>
            {/* 键盘用户按第一下 Tab 即可跳过侧边栏导航直达主内容 */}
            <a href="#main-content" className="skip-link">
                跳到主内容
            </a>

            {/* 悬浮侧边栏（含导航 + 左下角用户中心/设置） */}
            <Sidebar
                isAdmin={isAdmin}
                collapsed={collapsed}
                onToggle={() => setCollapsed((v) => !v)}
                userInfo={userInfo}
                onOpenSettings={() => setSettingsOpen(true)}
                settingsOpen={settingsOpen}
                menuItems={userMenuItems}
                onMenuClick={handleMenuClick}
            />

            <div
                id="main-content"
                // tabIndex=-1 让 skip link 的锚点跳转能真正把焦点移进来。
                // 刻意**不写 outline:none**：去掉焦点环却不给替代是反模式。
                tabIndex={-1}
                className={`app-content ${collapsed ? "is-collapsed" : ""}`}
            >
                {/* 宽屏约束：2560 宽下如果不限宽，状态条每格会被拉到 400px 宽 */}
                <div className="app-inner">
                    {/* 顶部栏已取消，只留右上角这一个悬浮通知按钮。
                        sticky 而不是 fixed：它占据流内高度，因此永远不会压住页面内容。 */}
                    <div className="top-action">
                        <Tooltip title="通知" placement="bottomRight">
                            <Button
                                className="glass-btn"
                                shape="circle"
                                size="large"
                                aria-label="通知"
                                icon={<BellOutlined aria-hidden="true" />}
                                onClick={() => message.info("暂无新通知")}
                            />
                        </Tooltip>
                    </div>

                    {/* 页面内容 - 由子路由填充 */}
                    <Outlet />
                </div>
            </div>

            {/* 系统设置弹窗：运行时配置大模型 API Key（保存即生效并同步写入 .env）。
                onSaved 是可选的（组件内部用 onSaved?.()），
                原来传它是为了刷新顶部状态条，状态条已按用户要求删除。 */}
            <LLMSettingsModal
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
            />
        </div>
    );
}
