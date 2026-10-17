import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['.claude', 'dist', 'dev-dist', 'raw', 'public/texts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
      prettier,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Only src/storage/ may touch IndexedDB (docs/PLAN.md, "Storage boundary").
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'dexie', message: 'Use the Storage interface in src/storage/.' }] },
      ],
    },
  },
  {
    files: ['src/storage/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
])
