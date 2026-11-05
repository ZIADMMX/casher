const js = require('@eslint/js');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
  {
    ignores: [
      'dist/**',
      'release/**',
      'build/**',
      'node_modules/**',
      'coverage/**',
      '.jest-cache/**',
      '.tmp*/**',
      '.tmp*',
      'electron/services/JsBarcode.all.min.js',
      'eslint.config.js',
      'e2e/**',
      'lib/**',
      'undefined/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.jsx', 'src/**/*.js'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // Disabled: calling setState inside useEffect is intentional here.
      // All data-fetching hooks use useCallback + useEffect which is the
      // recommended React pattern. The rule produces false positives for it.
      'react-hooks/set-state-in-effect': 'off',
      'no-unused-vars': 'warn',
      // All main-process calls go through src/api (generated from electron/preload.js).
      'no-restricted-properties': ['error', {
        object: 'window',
        property: 'electronAPI',
        message: "Import the call from src/api/<domain>.js instead (e.g. import * as crmApi from '../api/crm.js').",
      }],
    },
  },
  {
    files: ['src/api/bridge.js'],
    rules: { 'no-restricted-properties': 'off' },
  },
  // ✅ بعد الإصلاح (إضافة routes/**/*.js لقائمة بيئة Node CommonJS):
  {
    files: ['electron/**/*.js', 'routes/**/*.js', '*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.nodeBuiltin },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['**/*.test.js', '**/__tests__/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.jest, ...globals.node, ...globals.nodeBuiltin },
    },
  },
  prettier,
];
