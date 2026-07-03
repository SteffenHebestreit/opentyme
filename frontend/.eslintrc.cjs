/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh', 'unused-imports'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/', 'playwright-report/', '*.config.*'],
  rules: {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // while(true) is idiomatic for SSE/stream read loops
    'no-constant-condition': ['error', { checkLoops: false }],
    // Auto-removable on --fix; keeps the tsc unused-import backlog at zero
    'unused-imports/no-unused-imports': 'warn',
  },
  overrides: [
    {
      files: ['*.d.ts'],
      rules: {
        'no-var': 'off', // global augmentation requires var
      },
    },
  ],
};
