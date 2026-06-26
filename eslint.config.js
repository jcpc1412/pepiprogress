// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const i18next = require('eslint-plugin-i18next');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'supabase/*', 'expo-env.d.ts'],
  },
  {
    // Cross-cutting rule #1 (spec 09): no hardcoded user-facing strings.
    // Every rendered string must come from an i18n catalog via t().
    files: ['src/**/*.{ts,tsx}'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }],
    },
  },
]);
