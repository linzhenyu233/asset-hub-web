import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

// 开发环境通过 Vite 代理转发 /api 到后端，避免跨域与 Cookie 的 SameSite 问题。
// 也可在 .env.local 里设置 VITE_API_BASE 直连后端（后端已开放 CORS）。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_PROXY_TARGET || 'http://192.168.30.239:20011'
  // 后端按 Origin 做来源校验，只允许其 CORS_ALLOWED_ORIGIN。
  // 开发端口是 5273，这里把转发给后端的 Origin 改写成后端允许的值。
  const proxyOrigin = env.VITE_PROXY_ORIGIN || 'http://localhost:5173'

  return {
    plugins: [vue()],
    server: {
      // 5273 为本项目专用端口：5173 常被同机其他 Vite 项目占用，
      // 被占用时 Vite 会静默换端口，导致代理/联调打到别的服务上。
      port: 5273,
      strictPort: false,
      host: true,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Origin', proxyOrigin)
            })
          },
        },
      },
    },
    preview: {
      port: 4173,
      host: true,
    },
  }
})
