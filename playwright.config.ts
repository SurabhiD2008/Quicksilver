import { defineConfig, devices } from '@playwright/test';
import { TEST_WIDTHS } from './lib/shared/limits.ts';

// Runs against the production build (`next start`) with no database, which is
// how a fresh clone and the zero-key demo behave.
const PORT = 3291;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 2,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }]],
  use: { baseURL: BASE_URL, trace: 'off', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'guard-selftest',
      testMatch: /guard\.selftest\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    ...TEST_WIDTHS.map((width) => ({
      name: `width-${width}`,
      testIgnore: /guard\.selftest\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width, height: 800 },
        isMobile: width < 768,
        hasTouch: width < 768,
      },
    })),
  ],
  webServer: {
    command: `npx next start -p ${PORT} -H 127.0.0.1`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { POSTGRES_URL: '', STATS_TOKEN: '' },
  },
});
