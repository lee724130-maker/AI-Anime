import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (id.includes('node_modules/@ant-design/icons')) return 'icons';
          // antd 保持自动分片，避免全部组件被打进一个超大 chunk
          if (id.includes('node_modules/react-router')) return 'router';
          if (/(^|[/\\])node_modules[/\\](react|react-dom|scheduler|react-is)([/\\]|$)/.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3000',
      '/static': 'http://localhost:3000',
    },
  },
})
