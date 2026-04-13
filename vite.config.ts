import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// 通过环境变量配置后端地址，便于切换 localhost / 局域网 IP / 生产环境
// 默认指向当前机器的局域网 IP，方便手机或其他设备访问
// 可在 .env.local 中覆盖：VITE_BACKEND_HOST=172.20.10.4 VITE_BACKEND_PORT=8000
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendHost = env.VITE_BACKEND_HOST || 'localhost'
  const backendPort = env.VITE_BACKEND_PORT || '8080'
  const backendTarget = `http://${backendHost}:${backendPort}`

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0', // 监听所有网卡，允许通过 IP 访问
      port: 3000,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
