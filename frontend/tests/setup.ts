import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Provide a stand-in for Vite's `import.meta` in the Jest (CommonJS) runtime.
// The import-meta-transformer rewrites `import.meta` to `globalThis.__IMPORT_META__`.
(globalThis as any).__IMPORT_META__ = {
  env: {
    DEV: false,
    PROD: true,
    MODE: 'test',
    BASE_URL: '/',
    SSR: false,
    VITE_API_BASE_URL: 'http://localhost:8000/api',
    VITE_KEYCLOAK_URL: 'http://localhost:8080',
    VITE_KEYCLOAK_REALM: 'tyme',
    VITE_KEYCLOAK_CLIENT_ID: 'tyme-app',
    ...process.env,
  },
};

// jsdom does not provide TextEncoder/TextDecoder, but react-router v7 (and other
// libraries) require them at import time. Polyfill them before any test runs.
if (typeof (global as any).TextEncoder === 'undefined') {
  (global as any).TextEncoder = TextEncoder;
}
if (typeof (global as any).TextDecoder === 'undefined') {
  (global as any).TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
}

// Simple mocks for browser APIs that might not be available in test environment
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  })),
});

// Mock ResizeObserver
(global as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock IntersectionObserver
(global as any).IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
