/**
 * 统一 API 访问层
 *
 * 解决的问题（原先每个页面各自为政）：
 *   1. 后端地址被硬编码在 9 个文件里，三种写法混用：
 *        http://127.0.0.1:8000 、 http://localhost:8000 、 http://0.0.0.0:8000（非法客户端目标）
 *   2. Login / CustomerProfile / AdminProfile 还会对这三个地址做"轮询尝试"，
 *      一次操作产生 3 倍失败请求，并把真正的错误埋在 console 里。
 *   3. 部分页面完全没带 Authorization 头，导致接口 401/422。
 *
 * 现在：默认走**相对路径** `/api/...`，由 Vite 的 server.proxy 转发到后端
 * （见 vite.config.mjs），因此开发期不存在跨域问题，也不用改 host。
 * 如需指向别的后端（例如部署到服务器），在 frontend/.env 里设置：
 *     VITE_API_BASE=https://your-host:8000
 * 或设置 VITE_BACKEND 让代理转发到别处。
 */

import axios from "axios";

/** 后端基址。默认空串 = 使用相对路径，交给 Vite 代理 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export const TOKEN_KEY = "token";
export const USER_KEY = "user";

/**
 * 读取本地保存的 JWT
 * @returns {string|null} 令牌；不存在或为历史脏数据 "undefined" 时返回 null
 */
export function getToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token || token === "undefined" || token === "null") return null;
  return token;
}

/**
 * 读取本地保存的当前用户
 * @returns {object|null} 用户对象；解析失败时返回 null（不会抛异常）
 */
export function getCurrentUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw || raw === "undefined" || raw === "null") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 当前登录用户是否为管理员
 * @returns {boolean}
 */
export function isAdmin() {
  return getCurrentUser()?.role === "admin";
}

/**
 * 写入登录会话
 * @param {{token: string, user: object}} session 登录接口返回的令牌与用户对象
 */
export function setSession({ token, user }) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * 清除登录会话
 */
export function clearSession() {
  [TOKEN_KEY, USER_KEY, "isAdmin", "role"].forEach((k) => localStorage.removeItem(k));
}

/**
 * 构造带 Bearer Token 的请求头
 * @param {object} extra 额外请求头
 * @returns {object} 请求头对象
 */
export function authHeaders(extra = {}) {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}

/**
 * 从 axios 错误中提取可读的错误信息
 * FastAPI 的错误体是 {detail: string} 或 {detail: [{msg, loc}]}，
 * 原先各页面读的是 err.response.data.error（后端从不返回该字段），
 * 所以永远只会显示兜底文案。
 *
 * @param {unknown} err 捕获到的错误
 * @param {string} fallback 兜底文案
 * @returns {string} 可展示的错误信息
 */
export function errorMessage(err, fallback = "请求失败，请稍后再试") {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail
      .map((item) => item?.msg ?? JSON.stringify(item))
      .join("；");
  }
  if (err?.response?.status === 401) return "登录已过期，请重新登录";
  if (err?.response?.status === 403) return "权限不足";
  return err?.message || fallback;
}

/**
 * 预置好 baseURL 与 JWT 拦截器的 axios 实例。
 * 页面可直接 `api.get("/api/...")`，无需再关心 host 与 Authorization 头。
 */
export const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
