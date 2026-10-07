import { Menu } from "antd";
import { Link, useLocation } from "react-router-dom";
import {
  HomeOutlined,           // 用于主页
  DatabaseOutlined,       // 用于图谱管理
  ApartmentOutlined,      // 用于中英双层对照
  BugOutlined,            // 用于病毒检测
  QuestionCircleOutlined, // 用于问答
  DeploymentUnitOutlined, // 用于系统推理 (更像推理网络)
  LineChartOutlined,      // 用于系统预测 (趋势/预测)
  TeamOutlined,           // 用于客户管理
} from "@ant-design/icons";

export default function Sidebar({ isAdmin = false }) {
  const location = useLocation();

  // 获取当前选中的菜单 key（取 URL 的最后一段）
  // 例如 /dashboard/graph -> graph
  // 注意：/dashboard 本身要归到 "home"，否则最后一段是 "dashboard"，侧边栏没有高亮
  const lastSegment = location.pathname.split("/").filter(Boolean).pop() || "home";
  const selectedKey = lastSegment === "dashboard" ? "home" : lastSegment;

  // 定义菜单项配置
  const items = [
    {
      key: "home",
      icon: <HomeOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard">系统概览</Link>,
    },
    {
      key: "graph",
      icon: <DatabaseOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/graph">知识图谱管理</Link>,
    },
    {
      key: "graph-dual",
      icon: <ApartmentOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/graph-dual">中英双层对照</Link>,
    },
    {
      key: "virus",
      icon: <BugOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/virus">病毒检测</Link>,
    },
    {
      key: "qa",
      icon: <QuestionCircleOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/qa">问答检索</Link>,
    },
    {
      key: "reasoning",
      icon: <DeploymentUnitOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/reasoning">系统推理</Link>,
    },
    // 仅管理员可见的菜单项
    ...(isAdmin ? [
      {
        type: "divider",
      },
      {
        key: "customers",
        icon: <TeamOutlined style={{ fontSize: '18px' }} />,
        label: <Link to="/dashboard/customers">客户管理</Link>,
      },
    ] : []),
  ];

  return (
    <div
      className="h-full flex flex-col"
      style={{
        width: "100%",
        background: "transparent",
        padding: "14px 0",
      }}
    >
      <Menu
        mode="inline"
        theme="light"
        selectedKeys={[selectedKey]}
        items={items}
        style={{
          background: "transparent",
          borderRight: 0,
        }}
      />
    </div>
  );
}
