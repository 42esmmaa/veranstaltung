import { defineConfig } from 'oxlint';

// oxlint-disable-next-line import/no-default-export
export default defineConfig({
  plugins: ['import', 'node', 'promise'],
  categories: {
    correctness: 'error',
    suspicious: 'error',
  },
  env: {
    es2022: true,
    node: true,
  },
  ignorePatterns: ['dist/**', 'drizzle/**', 'drizzle.config.ts'],
  options: {
    denyWarnings: true,
    reportUnusedDisableDirectives: 'error',
  },
  rules: {
    curly: ['error', 'all'],
    eqeqeq: 'error',
    'no-duplicate-imports': 'error',
    'no-unused-vars': 'error',
    'import/first': 'error',
    'import/no-default-export': 'error',
    'import/no-self-import': 'error',
    'promise/no-multiple-resolved': 'error',
    'typescript/consistent-type-imports': 'error',
  },
  overrides: [
    {
      files: ['test/**/*.test.ts'],
      plugins: ['vitest', 'import'],
      rules: {
        'vitest/consistent-test-it': ['error', { withinDescribe: 'test' }],
      },
    },
  ],
});
