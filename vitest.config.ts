import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    coverage: {
      provider: 'v8',
      include: ['lib/server/**/*.ts', 'lib/shared/**/*.ts', 'lib/client/**/*.ts'],
      exclude: ['lib/server/runtime.ts', 'lib/server/db.ts', 'lib/client/epilogue.ts'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: { lines: 80 },
    },
  },
});
