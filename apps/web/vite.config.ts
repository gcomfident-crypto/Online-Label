import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3010';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom', 'zustand'],
          editor: ['@ckeditor/ckeditor5-react', 'ckeditor5'],
          charts: ['recharts'],
          export_tools: ['jszip'],
          json_tools: ['jsoneditor'],
          dnd: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/testSetup.ts',
  },
});
