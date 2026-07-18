import { defineConfig } from 'vitest/config';

/**
 * Unit-test runner for pure, offline logic (verdict engine, derived metrics,
 * reconstitution, etc.). Scoped to `**\/*.test.ts` so it never pulls React
 * Native / Metro modules — the tested code must stay pure. `@/*` path aliases
 * are resolved natively from tsconfig.
 *
 * Also picks up `supabase/functions/_shared/**\/*.test.ts` — the Deno edge
 * function's shared modules (posture.ts, transition-context.ts) are plain,
 * import-free TS designed for reuse, so their string-building logic is
 * unit-testable here at zero API cost, importing the exact module the edge
 * function ships (no drift risk from a duplicated eval script).
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['src/**/*.test.ts', 'supabase/functions/_shared/**/*.test.ts'],
    environment: 'node',
  },
});
