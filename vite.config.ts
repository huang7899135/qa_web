import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': '/src' // 设置 @ 别名指向 src 目录
    }
  },
  build: {
    outDir: 'dist', // 输出目录
    sourcemap: false  // 关闭 source map，提升安全性
  },
  server: { // 添加 server 配置
    allowedHosts: [
      'visionblue.cloud' // 添加你的反向代理主机名
    ]
  }
})
