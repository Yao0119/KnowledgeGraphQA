import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, App as AntApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import App from "./App";
import { antdTheme } from "./theme";
import { applyPreferences, getPreferences } from "./preferences";
import "./index.css";

// 在首屏渲染前应用本地偏好，避免主题或字号先闪一下默认值。
const currentUser = (() => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
})();
applyPreferences(getPreferences(currentUser?.id));

const systemThemeQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
systemThemeQuery?.addEventListener?.("change", () => {
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  })();
  const preferences = getPreferences(user?.id);
  if (preferences.theme === "system") applyPreferences(preferences);
});

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

const rootElement = document.getElementById("root");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ConfigProvider theme={antdTheme} locale={zhCN}>
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);

// 首屏加载层放在 React 根节点之外，等 React 完成第一次 DOM 提交后再淡出，
// 避免加载层被 createRoot 直接抹掉造成一次硬切闪屏。
const dismissBootScreen = () => {
  const bootScreen = document.getElementById("boot-screen");
  if (!bootScreen) return;

  const fadeOut = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bootScreen.classList.add("is-hidden");
        const remove = () => bootScreen.remove();
        bootScreen.addEventListener("transitionend", remove, { once: true });
        window.setTimeout(remove, 300);
      });
    });
  };

  const observer = new MutationObserver(() => {
    if (rootElement.childElementCount > 0) {
      observer.disconnect();
      fadeOut();
    }
  });
  observer.observe(rootElement, { childList: true });

  if (rootElement.childElementCount > 0) {
    observer.disconnect();
    fadeOut();
  }
};

dismissBootScreen();
