import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, App as AntApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import App from "./App";
import { antdTheme } from "./theme";
import "./index.css";

/**
 * 应用根
 *
 * 用 ConfigProvider 的**设计令牌**改 antd 主题，而不是在 CSS 里堆 !important。
 * 原来的 index.css 有 20 多处 `!important` 覆盖 antd，优先级互相打架、
 * 且一旦升级 antd 就可能全部失效；改成令牌后由 antd 自己算派生色（悬停/禁用/边框）。
 *
 * 两个坑都在这处理：
 *  1. message/notification/Modal 的**静态方法**（`notification.success(...)`）
 *     不在 React 树里，拿不到 ConfigProvider 的 context，会退回 antd 默认主题
 *     （表现为强调色是默认蓝而不是我们的 #1E40AF），控制台还会警告。
 *     官方解法就是下面的 `holderRender`。
 *  2. <AntApp> 给组件内的 `App.useApp()` 提供上下文（Modal.confirm 之类需要）。
 */
ConfigProvider.config({
  holderRender: (children) => (
    <ConfigProvider theme={antdTheme} locale={zhCN}>
      {children}
    </ConfigProvider>
  ),
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConfigProvider theme={antdTheme} locale={zhCN}>
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
