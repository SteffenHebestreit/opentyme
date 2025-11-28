/// <reference types="jest" />
/// <reference types="@testing-library/react" />

declare global {
  namespace NodeJS {
    interface Global {
      __TEST__: boolean;
    }
  }

  var describe: jest.Describe;
  var it: jest.It;
  var test: jest.It;
  var expect: jest.Expect;
  var beforeEach: jest.HookFn;
  var afterEach: jest.HookFn;
  var beforeAll: jest.HookFn;
  var afterAll: jest.HookFn;

  // Mocks for browser APIs
  interface Window {
    matchMedia: (query: string) => MediaQueryList;
  }
}

export {};
