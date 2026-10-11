import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import GraphManager from "./pages/GraphManager";
import GraphCatalog from "./pages/GraphCatalog";
import GraphDual from "./pages/GraphDual";
import QA from "./pages/QA";
import Predict from "./pages/Predict";
import VirusDetection from "./pages/VirusDetection"; // 新增病毒检测页面
import CustomerProfile from "./pages/CustomerProfile";
import AdminProfile from "./pages/AdminProfile";
import AdminCustomerManagement from "./pages/AdminCustomerManagement";
// 注意：原 pages/Profile.jsx 调用的 /api/user/profile/{username} 后端从未实现过，
// 属于废弃的重复页面，已删除；/dashboard/profile 现在重定向到统一的资料页。

// 简单的受保护路由组件
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 默认进入当前图谱工作区 */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        
        {/* 认证页面 */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        {/* 客户端主界面（知识图谱使用）*/}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        >
          {/* 登录后默认进入图谱管理；系统概览仍保留在侧边栏 */}
          <Route index element={<Navigate to="graph" replace />} />
          <Route path="overview" element={<Home />} />
          <Route path="graph" element={<GraphCatalog />} />
          <Route path="graph/:graphId" element={<GraphManager />} />
          {/* 中英双层对照图谱：左右两个面板分别渲染 cn / en 层，核心节点跨层映射 */}
          <Route path="graph-dual" element={<GraphDual />} />
          <Route path="qa" element={<QA />} />
          {/* 原 Profile.jsx 已废弃：它请求的 /api/user/profile/* 后端不存在。
              统一到 /customer-profile（管理员同样可用）。 */}
          <Route path="profile" element={<Navigate to="/customer-profile" replace />} />
          <Route path="predict" element={<Predict />} />
          <Route path="virus" element={<VirusDetection />} /> {/* 新增路由 */}
          <Route path="customers" element={<AdminCustomerManagement />} />
        </Route>
        
        {/* 客户端个人资料管理 */}
        <Route path="/customer-profile" element={<ProtectedRoute><CustomerProfile /></ProtectedRoute>} />
        <Route path="/customer/profile" element={<ProtectedRoute><CustomerProfile /></ProtectedRoute>} />
        
        {/* 管理员个人资料管理 */}
        <Route path="/admin-profile" element={<ProtectedRoute><AdminProfile /></ProtectedRoute>} />
        <Route path="/admin/profile" element={<ProtectedRoute><AdminProfile /></ProtectedRoute>} />
        
        {/* 管理员页面 */}
        <Route path="/admin/customers" element={<ProtectedRoute><AdminCustomerManagement /></ProtectedRoute>} />
        
        {/* 404页面 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
