import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // 把大体积依赖拆成独立长效缓存 chunk，避免主包接近 1MB
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (id.includes('node_modules/@ant-design/icons')) return 'icons';
          // antd 自身保持自动分片：强行聚成一个 chunk 会把按路由加载的组件打回 1.2MB 巨包
          if (id.includes('node_modules/react-router')) return 'router';
          if (/(^|[/\\])node_modules[/\\](react|react-dom|scheduler|react-is)([/\\]|$)/.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/static': 'http://localhost:3000',
    },
  },
})
