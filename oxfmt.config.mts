import { defineConfig } from 'oxfmt';

// oxlint-disable-next-line import/no-default-export
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
