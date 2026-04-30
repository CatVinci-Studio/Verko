import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'out/**',
      'node_modules/**',
      '*.config.js',
      '*.config.ts',
      'src/preload/**',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    plugins: {
      // The classic two react-hooks rules. The 7.x package also ships
      // a batch of stricter "modern React" rules (set-state-in-effect,
      // use-memo, incompatible-library, …). Those are aspirational; not
      // wiring them up because most existing patterns are intentional.
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Classic react-hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // tsconfig already enforces no-unused-locals; no need to duplicate
      '@typescript-eslint/no-unused-vars': 'off',

      // The new "wrap caught errors with { cause }" rule from ESLint 10's
      // recommended set. We deliberately re-throw simplified Errors at IPC
      // boundaries to avoid leaking internal stack traces to the renderer.
      'preserve-caught-error': 'off',

      // We use `any` deliberately for generic callable signatures
      // (lib/utils.ts debounce). Keep visible as a warning.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Vite/electron-vite Fast Refresh boundary rule
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ['src/electron/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
