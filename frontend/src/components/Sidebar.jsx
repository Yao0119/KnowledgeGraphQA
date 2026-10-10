/**
 * 悬浮侧边栏
 *
 * 按用户指定的方向重做：
 *   - 悬浮：距窗口四边 12px，大圆角 + 毛玻璃 + 浮起投影（原来是贴边的实心条）
 *   - 取消顶部栏后，**用户中心与系统设置移到左下角**
 *   - 单色：选中态用浅灰填充 + 近黑文字，不用彩色
 *   - 折叠时只留图标与折叠按钮
 */

import { Menu, Dropdown, Avatar, Button, Tooltip } from "antd";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  HomeOutlined, // 系统概览
  DatabaseOutlined, // 知识图谱管理
  ApartmentOutlined, // 中英双层对照
  BugOutlined, // 病毒检测
  QuestionCircleOutlined, // 问答检索
  DeploymentUnitOutlined, // 系统推理
  TeamOutlined, // 客户管理
  SettingOutlined, // 系统设置（左下角）
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from "@ant-design/icons";
import { color } from "../theme";

const SIDEBAR_WIDTH = 250;

/** 菜单 key → 路由。用于菜单层的点击兜底（见下方 Menu 的 onClick） */
const NAV_PATHS = {
  home: "/dashboard",
  graph: "/dashboard/graph",
  "graph-dual": "/dashboard/graph-dual",
  virus: "/dashboard/virus",
  qa: "/dashboard/qa",
  reasoning: "/dashboard/reasoning",
  customers: "/dashboard/customers",
};
/**
 * 折叠宽度必须是 **80**，不能随便取 76 之类的值。
 *
 * antd 的折叠态菜单靠 `padding-left: calc(50% - 图标一半)` 把图标居中，
 * 同时它自己固定按 80px 宽来排版。容器宽度只要不等于 80，这个公式算出来的
 * 中心就和侧边栏的视觉中心错位：原先用 76 时实测菜单溢出到 85px、
 * 每个图标右偏 4px（用户报的"收起时不居中"）。
 * 与其去覆盖 antd 的内边距，不如让容器宽度符合它的前提。
 */
const SIDEBAR_COLLAPSED_WIDTH = 80;

export default function Sidebar({
  isAdmin = false,
  collapsed = false,
  onToggle,
  userInfo,
  onOpenSettings,
  settingsOpen = false,
  menuItems = [],
  onMenuClick,
}) {
  const location = useLocation();
  const navigate = useNavigate();

  // 当前选中的菜单 key（取 URL 的最后一段）
  // 例如 /dashboard/graph -> graph
  // 注意：/dashboard 本身要归到 "home"，否则最后一段是 "dashboard"，侧边栏没有高亮
  const lastSegment = location.pathname.split("/").filter(Boolean).pop() || "home";
  const selectedKey = lastSegment === "dashboard" ? "home" : lastSegment;

  const iconSize = 17;

  /**
   * 导航项工厂。
   *
   * 为什么不使用 antd 的 `inlineCollapsed`：
   *   它把折叠菜单排成 85px 宽，再用 `padding-left: calc(50% - 图标一半)` 居中。
   *   容器宽度只要不等于它的内部预期，整套计算就整体偏移（实测每个图标右偏 4px），
   *   而且它隐藏标签的方式与自定义 padding 会互相打架。
   * 现在改为：菜单始终是非折叠模式，折叠状态由外层 class 控制 CSS 隐藏文字，
   * 并用 Tooltip 把名称补回来 —— 完全可控，且不丢可读性。
   *
   * ⚠️ 折叠时 Link 必须挂在**图标**上：
   *    展开态的 <Link> 在标签里，而折叠时标签被 `display: none` 隐藏，
   *    链接会跟着一起消失 —— 菜单项本身没有点击处理，
   *    结果就是"收起后点图标没反应"（用户报的 bug）。
   */
  const nav = (key, title, path, Icon) => ({
    key,
    icon: collapsed ? (
      <Tooltip title={title} placement="right">
        <Link
          to={path}
          aria-label={title}
          style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Icon style={{ fontSize: iconSize }} aria-hidden="true" />
        </Link>
      </Tooltip>
    ) : (
      <Icon style={{ fontSize: iconSize }} aria-hidden="true" />
    ),
    label: <Link to={path}>{title}</Link>,
  });

  const items = [
    nav("home", "系统概览", "/dashboard", HomeOutlined),
    nav("graph", "知识图谱管理", "/dashboard/graph", DatabaseOutlined),
    nav("graph-dual", "中英双层对照", "/dashboard/graph-dual", ApartmentOutlined),
    nav("virus", "病毒检测", "/dashboard/virus", BugOutlined),
    nav("qa", "问答检索", "/dashboard/qa", QuestionCircleOutlined),
    nav("reasoning", "系统推理", "/dashboard/reasoning", DeploymentUnitOutlined),
    // 仅管理员可见
    ...(isAdmin ? [{ type: "divider" }, nav("customers", "客户管理", "/dashboard/customers", TeamOutlined)] : []),
  ];

  const username = userInfo?.username || "用户";
  const initial = username.trim().slice(0, 1).toUpperCase();

  return (
    <aside
      className="sidebar-float"
      style={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
    >
      {/* 头部：展开时显示品牌与标题；折叠时只留折叠按钮（保证随时能展开回来）。
          折叠时整个头部改为居中，并且左右内边距对称 ——
          否则按钮会偏在左边（用户报的"展开按钮没居中"）。 */}
      <div
        className="sidebar-head"
        style={
          collapsed
            ? { justifyContent: "center", padding: "14px 0 10px" }
            : { padding: "14px 12px 10px 14px" }
        }
      >
        {!collapsed && (
          <>
            <span className="brand-tile">
              <HomeOutlined aria-hidden="true" style={{ fontSize: 16 }} />
            </span>
            <h1
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                color: color.fg,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              知识图谱安全分析平台
            </h1>
          </>
        )}
        <Tooltip title={collapsed ? "展开侧边栏" : "折叠侧边栏"} placement="right">
          <Button
            type="text"
            shape="circle"
            aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
            onClick={onToggle}
            style={{ marginLeft: collapsed ? 0 : "auto", color: color.fgMuted, flex: "none" }}
            icon={
              collapsed ? (
                <MenuUnfoldOutlined aria-hidden="true" style={{ fontSize: 15 }} />
              ) : (
                <MenuFoldOutlined aria-hidden="true" style={{ fontSize: 15 }} />
              )
            }
          />
        </Tooltip>
      </div>

      {/* 主导航。折叠状态由外层 class 交给 CSS 处理（见 index.css），
          不使用 antd 的 inlineCollapsed —— 它的宽度/居中假设不可靠 */}
      <nav className={`sidebar-nav ${collapsed ? "is-collapsed" : ""}`} aria-label="主导航">
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={items}
          // 点击兜底：折叠态下标签被 CSS 隐藏，若用户点的不是图标正中，
          // 菜单项自身也要能跳转。
          // 若这一下点的就是标签里的 <Link>，react-router 已经 preventDefault
          // 并完成导航，这里直接跳过，避免多压一条重复的历史记录。
          onClick={({ key, domEvent }) => {
            if (domEvent?.defaultPrevented) return;
            const to = NAV_PATHS[key];
            if (to) navigate(to);
          }}
          style={{ background: "transparent", borderInlineEnd: 0 }}
        />
      </nav>

      {/* 左下角：系统设置 + 用户中心（按用户要求从顶部栏移到这里） */}
      <div className="sidebar-foot">
        {collapsed ? (
          <Tooltip title="系统设置" placement="right">
            <button
              type="button"
              className={`side-action ${settingsOpen ? "is-active" : ""}`}
              aria-label="系统设置"
              onClick={onOpenSettings}
              style={{ justifyContent: "center" }}
            >
              <SettingOutlined aria-hidden="true" style={{ fontSize: 16 }} />
            </button>
          </Tooltip>
        ) : (
          <button
            type="button"
            className={`side-action ${settingsOpen ? "is-active" : ""}`}
            onClick={onOpenSettings}
          >
            <SettingOutlined aria-hidden="true" style={{ fontSize: 16 }} />
            <span>系统设置</span>
          </button>
        )}

        <Dropdown
          menu={{ items: menuItems, onClick: onMenuClick }}
          trigger={["click"]}
          placement="topLeft"
        >
          <button
            type="button"
            className="side-user"
            aria-label="账号菜单"
            style={{ justifyContent: collapsed ? "center" : "flex-start" }}
          >
            {/* 首字母而不是通用"小人"图标：后者不携带任何信息 */}
            <Avatar
              size={26}
              style={{
                background: color.primary,
                flex: "none",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {initial}
            </Avatar>
            {!collapsed && (
              <span style={{ minWidth: 0, textAlign: "left" }}>
                <span className="side-user-name">{username}</span>
                <span className="side-user-role">{isAdmin ? "管理员" : "客户"}</span>
              </span>
            )}
          </button>
        </Dropdown>
      </div>
    </aside>
  );
}
