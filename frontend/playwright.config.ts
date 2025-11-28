import { defineConfig, devices } from '@playwright/test';

const useExternalServer = process.env.PLAYWRIGHT_USE_EXTERNAL?.toLowerCase() === 'true';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://frontend:3000';

export default defineConfig({
  testDir: 'tests/ui',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: useExternalServer
    ? undefined
    : {
        command: 'npm run preview -- --host 0.0.0.0 --port 4173',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
