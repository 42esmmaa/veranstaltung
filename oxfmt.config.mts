import { defineConfig } from 'oxfmt';

export default defineConfig({
  singleQuote: true,
  trailingComma: 'all',
  overrides: [
    {
      files: ['*.toml', '*.yml', '*.yaml'],
      options: {
        singleQuote: false,
      },
    },
  ],
  ignorePatterns: ['*.md', 'drizzle/**', 'keycloak/**', 'pnpm-lock.yaml'],
});
