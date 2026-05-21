import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/llm': 'http://localhost:3000',
      '/tasks': 'http://localhost:3000',
      '/templates': 'http://localhost:3000',
      '/exports': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/testSetup.ts',
  },
});
