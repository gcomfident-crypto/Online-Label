import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  projects: [
    {
      name: 'chromium-1280',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'chromium-1920',
      use: {
        browserName: 'chromium',
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'chromium-2560',
      use: {
        browserName: 'chromium',
        viewport: { width: 2560, height: 1440 },
      },
    },
    {
      name: 'chromium-3840',
      use: {
        browserName: 'chromium',
        viewport: { width: 3840, height: 2160 },
      },
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:5175',
    channel: process.env.PW_BROWSER_CHANNEL,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --dir apps/api exec tsx src/main.ts',
      reuseExistingServer: process.env.PW_REUSE_EXISTING_SERVER === '1',
      timeout: 30_000,
      url: 'http://127.0.0.1:3000/health',
    },
    {
      command: 'pnpm --dir apps/web exec vite --host 127.0.0.1 --port 5175',
      reuseExistingServer: process.env.PW_REUSE_EXISTING_SERVER === '1',
      timeout: 30_000,
      url: 'http://127.0.0.1:5175/dev/renderer',
    },
  ],
});
