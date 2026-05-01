import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Polling intervals + filter-fallback patterns trigger this; the suggested
      // refactor (move to event handlers / external sync) is not applicable here
      // because the fetch is on a timer, not a user action.
      'react-hooks/set-state-in-effect': 'off',
      // ToastProvider co-locates the hook with the component on purpose.
      'react-refresh/only-export-components': 'off',
    },
  },
])
