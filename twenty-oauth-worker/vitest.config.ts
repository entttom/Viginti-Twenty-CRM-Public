import { defineConfig } from 'vitest/config';

// Node-based Vitest setup. The Worker code depends only on Web-standard globals
// (crypto.subtle, fetch, Request/Response, TextEncoder/TextDecoder, atob/btoa)
// which Node 18+ provides, so tests run without the workerd pool. D1 is
// abstracted behind a repository and replaced with an in-memory fake in tests;
// all upstream OAuth calls are mocked so no real network request is ever made.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
  },
});
