import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 后端地址（开发期由 Vite 反向代理转发，避免跨域与硬编码 host）
const BACKEND = process.env.VITE_BACKEND || 'http://127.0.0.1:8000'

// 把所有 /api 请求转发到 FastAPI。
// 这样前端只需使用相对路径 `/api/...`，不再需要每个页面硬编码
// http://127.0.0.1:8000 或 http://localhost:8000（更不会出现非法的 0.0.0.0）。
const proxy = {
  '/api': {
    target: BACKEND,
    changeOrigin: true,
  },
}

export default defineConfig({
  // Tailwind v4 必须通过官方 Vite 插件接入：v4 不再读取 tailwind.config.js，
  // 也不再依赖 postcss.config.js（原来的 v3 写法因此完全没生效）。
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy,
  },
  preview: {
    port: 4173,
    proxy,
  },
})
