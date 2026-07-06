import { defineConfig } from 'vitest/config';

/**
 * Unit-test runner for pure, offline logic (verdict engine, derived metrics,
 * reconstitution, etc.). Scoped to `**\/*.test.ts` so it never pulls React
 * Native / Metro modules — the tested code must stay pure. `@/*` path aliases
 * are resolved natively from tsconfig.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
