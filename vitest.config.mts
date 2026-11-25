import { defineConfig } from 'vitest/config';

// oxlint-disable-next-line import/no-default-export
export default defineConfig({
  // Gleiche Modulvariante für GraphQL im Testcode und in externen Paketen.
  ssr: {
    resolve: {
      conditions: ['module-sync', 'node'],
    },
  },
});
