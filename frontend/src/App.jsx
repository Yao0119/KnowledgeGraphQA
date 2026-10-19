import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import {
  SESSION_EXPIRED_EVENT,
  clearSession,
  getCurrentUser,
  getToken,
  hasValidSession,
  isGuestMode,
} from "./api";
import Login from "./pages/Login";

// 登录页保持同步加载；其余页面按路由拆包，避免首次访问时把
// vis-network、图谱编辑和管理端代码全部下载下来。
const Register = lazy(() => import("./pages/Register"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Home = lazy(() => import("./pages/Home"));
const GraphManager = lazy(() => import("./pages/GraphManager"));
const GraphCatalog = lazy(() => import("./pages/GraphCatalog"));
const GraphDual = lazy(() => import("./pages/GraphDual"));
const QA = lazy(() => import("./pages/QA"));
const Predict = lazy(() => import("./pages/Predict"));
const VirusDetection = lazy(() => import("./pages/VirusDetection"));
const CustomerProfile = lazy(() => import("./pages/CustomerProfile"));
const AdminProfile = lazy(() => import("./pages/AdminProfile"));
const AdminCustomerManagement = lazy(() => import("./pages/AdminCustomerManagement"));
// 注意：原 pages/Profile.jsx 调用的 /api/user/profile/{username} 后端从未实现过，
// 属于废弃的重复页面，已删除；/dashboard/profile 现在重定向到统一的资料页。

const RouteLoading = () => (
  <div className="route-loading" role="status" aria-live="polite">
    <span className="route-loading-mark" aria-hidden="true" />
    <span>正在加载工作区</span>
  </div>
);

const lazyRoute = (element) => (
  <Suspense fallback={<RouteLoading />}>
    {element}
  </Suspense>
);

const clearBrokenSession = () => {
  if (getToken() || getCurrentUser()) clearSession();
};

// 登录用户路由。guestAllowed 仅用于允许游客查看公开概览外壳。
const ProtectedRoute = ({ children, guestAllowed = false }) => {
  if (hasValidSession()) return children;
  if (guestAllowed && isGuestMode()) return children;

  clearBrokenSession();
  return <Navigate to="/login" replace />;
};

// 图谱管理、上传、问答等仍要求真实登录态，游客不能绕过。
const SessionRoute = ({ children }) => {
  if (hasValidSession()) return children;

  clearBrokenSession();
  return <Navigate to="/login" replace />;
};

const EntryRedirect = () => {
  if (hasValidSession()) {
    return <Navigate to="/dashboard/graph" replace />;
  }
  if (isGuestMode()) {
    return <Navigate to="/dashboard/overview" replace />;
  }
  return <Navigate to="/login" replace />;
};

const SessionExpiryListener = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleExpired = () => navigate("/login", { replace: true });
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
  }, [navigate]);

  return null;
};

const LegacyProfileRedirect = () => {
  const token = getToken();
  const user = getCurrentUser();
  if (!token || !user) {
    clearSession();
    return <Navigate to="/login" replace />;
  }
  return <Navigate to="/customer-profile" replace />;
};

export default function App() {
  return (
    <BrowserRouter>
      <SessionExpiryListener />
      <Routes>
        {/* 入口一次性决定最终目标，避免 / -> /dashboard -> /login 连续重定向。 */}
        <Route path="/" element={<EntryRedirect />} />

        {/* 认证页面 */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={lazyRoute(<Register />)} />

        {/* 客户端主界面。游客只批准外壳，子路由仍由 SessionRoute 控制。 */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute guestAllowed>
              {lazyRoute(<Dashboard />)}
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={lazyRoute(<Home />)} />
          <Route path="graph" element={lazyRoute(<SessionRoute><GraphCatalog /></SessionRoute>)} />
          <Route path="graph/:graphId" element={lazyRoute(<SessionRoute><GraphManager /></SessionRoute>)} />
          {/* 中英双层对照图谱：左右两个面板分别渲染 cn / en 层，核心节点跨层映射 */}
          <Route path="graph-dual" element={lazyRoute(<SessionRoute><GraphDual /></SessionRoute>)} />
          <Route path="qa" element={lazyRoute(<SessionRoute><QA /></SessionRoute>)} />
          {/* 原 Profile.jsx 已废弃：它请求的 /api/user/profile/* 后端不存在。
              统一到 /customer-profile（管理员同样可用）。 */}
          <Route path="profile" element={<LegacyProfileRedirect />} />
          <Route path="predict" element={lazyRoute(<SessionRoute><Predict /></SessionRoute>)} />
          <Route path="virus" element={lazyRoute(<SessionRoute><VirusDetection /></SessionRoute>)} />
          <Route path="customers" element={lazyRoute(<SessionRoute><AdminCustomerManagement /></SessionRoute>)} />
        </Route>

        {/* 客户端个人资料管理 */}
        <Route path="/customer-profile" element={<ProtectedRoute>{lazyRoute(<CustomerProfile />)}</ProtectedRoute>} />
        <Route path="/customer/profile" element={<ProtectedRoute>{lazyRoute(<CustomerProfile />)}</ProtectedRoute>} />

        {/* 管理员个人资料管理 */}
        <Route path="/admin-profile" element={<ProtectedRoute>{lazyRoute(<AdminProfile />)}</ProtectedRoute>} />
        <Route path="/admin/profile" element={<ProtectedRoute>{lazyRoute(<AdminProfile />)}</ProtectedRoute>} />

        {/* 管理员页面 */}
        <Route path="/admin/customers" element={<ProtectedRoute>{lazyRoute(<AdminCustomerManagement />)}</ProtectedRoute>} />

        {/* 404页面 */}
        <Route path="*" element={<EntryRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}
