import { defineConfig } from '@playwright/test';

/**
 * G18 release browser gate.
 * - DEV server (real Vite app + DEV-only QA launch).
 * - Sequential workers for deterministic screenshots and mobile CPU sanity.
 * - No pixel-diff CI gate: assertions are structural + human-review captures.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.G18_BASE_URL ?? 'http://127.0.0.1:3100',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'bunx vite --port 3100 --host 127.0.0.1',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
