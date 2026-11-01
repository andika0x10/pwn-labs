import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  { ignores: ['**/dist/**', '**/.astro/**', '**/.wrangler/**', '**/node_modules/**', 'test-results/**', 'playwright-report/**', 'apps/web/public/emulator/**', 'apps/web/src/generated/**', '**/worker-configuration.d.ts', 'spike/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    files: ['scripts/**/*.mjs', '*.config.{js,mjs,ts}'],
    languageOptions: { globals: { ...globals.node, ...globals.es2025 } },
  },
  {
    files: ['**/*.{ts,tsx,astro}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
