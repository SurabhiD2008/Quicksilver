import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: false, skipComments: false }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: false, skipComments: false }],
      'no-console': 'error',
      'no-debugger': 'error',
      'no-eval': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Command-line scripts report to the terminal; the logger is the one place
    // server code writes to the console.
    files: ['scripts/**/*.ts', 'lib/server/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Test files are long tables of cases; the function limit applies to the
    // code under test, not to describe blocks.
    files: ['tests/**/*.ts', 'e2e/**/*.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'test-results/**',
    'playwright-report/**',
    'next-env.d.ts',
  ]),
]);
