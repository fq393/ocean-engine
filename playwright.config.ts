import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // WebGL asset decoding is intentionally serialized: parallel Chromium GPU
  // contexts can starve the generated yacht's embedded PBR textures on laptops.
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    viewport: { width: 1920, height: 1080 },
    launchOptions: {
      args: process.platform === 'darwin' ? ['--use-angle=metal'] : [],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: true,
  },
});
