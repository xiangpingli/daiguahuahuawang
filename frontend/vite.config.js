import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 开发模式下 /api 与 /artworks-img 代理到本地 9999 端口的 FastAPI 服务
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:9999',
      '/artworks-img': 'http://localhost:9999',
    },
  },
})
