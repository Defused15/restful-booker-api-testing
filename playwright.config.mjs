import { defineConfig } from '@playwright/test';

const PORT = 4317;

export default defineConfig({
  testDir: 'tests/report',
  testMatch: '*.spec.mjs',
  globalSetup: './tests/report/global-setup.mjs',
  outputDir: 'test-results/output',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'test-results/html' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node tests/report/serve.mjs`,
    url: `http://127.0.0.1:${PORT}/health`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 } },
    // Layout stability in WebKit, where bubbling transitionend events once cut
    // the table collapse short.
    {
      name: 'desktop-webkit',
      grep: /filtering|paging|search keeps/,
      use: { browserName: 'webkit', viewport: { width: 1440, height: 900 } },
    },
  ],
});
