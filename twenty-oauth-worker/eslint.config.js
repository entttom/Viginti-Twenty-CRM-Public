import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const webGlobals = {
  crypto: 'readonly',
  fetch: 'readonly',
  Response: 'readonly',
  Request: 'readonly',
  RequestInfo: 'readonly',
  RequestInit: 'readonly',
  Headers: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  AbortController: 'readonly',
  DOMException: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  globalThis: 'readonly',
  D1Database: 'readonly',
  ExportedHandler: 'readonly',
  ExecutionContext: 'readonly',
};

const nodeGlobals = {
  process: 'readonly',
  Buffer: 'readonly',
  console: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  AbortController: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
};

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', '.wrangler', 'coverage'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: { globals: webGlobals },
    rules: {
      'no-console': ['warn', { allow: ['log'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: nodeGlobals },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
