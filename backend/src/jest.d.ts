// Jest global types and matchers
declare namespace jest {
  interface Matchers<R> {
    not: Matchers<R>;
    resolves: Matchers<Promise<Awaited<R>>>;
    rejects: Matchers<Promise<any>>;

    toBeNull(): R extends null | Promise<null> ? true : never;
    toBeUndefined(): R extends undefined | Promise<undefined> ? true : never;
    toBeDefined(): R extends null | undefined | Promise<null | undefined> ? never : true;
    toBeTruthy(): R extends boolean | Promise<boolean> ? true : never;
    toBeFalsy(): R extends boolean | Promise<boolean> ? true : never;

    toBe(expected: any): R is typeof expected;
    toEqual<E>(expected: E): R is E;
    toStrictEqual<E>(expected: E): R is E;

    toMatch(regexpOrString: string | RegExp): R extends string | RegExp ? true : never;
    toContain<E = unknown>(item: E): boolean;
    toContainEqual<E = unknown>(item: E): boolean;

    toBeGreaterThan(expected: number): R extends number ? true : never;
    toBeGreaterThanOrEqual(expected: number): R extends number ? true : never;
    toBeLessThan(expected: number): R extends number ? true : never;
    toBeLessThanOrEqual(expected: number): R extends number ? true : never;

    toCloseTo(expected: number, precision?: number): R extends number ? true : never;
    toHaveLength(length: number): R extends any[] | string | Promise<any[]> | Promise<string> ? true : never;

    toThrow(error?: Error | string | RegExp): void;
    toMatchSnapshot(propertyMatchers?: any, snapshotName?: string): void;
    toMatchInlineSnapshot(snapshot?: string): void;
  }

  interface Expect {
    <T = any>(actual: T): Matchers<T>;
    extend(matchers: Record<string, any>): typeof expect;
    addEqualityTesttester(fn: (a: any, b: any) => boolean | number): void;
    assertions(expectedAssertions: number): void;
    hasAssertions(): void;
  }

  interface DoneCallback {
    (...args: any[]): void;
    fail(error?: string | Error): never;
  }

  type TestCallback = (done?: DoneCallback) => void | Promise<unknown>;
  type HookCallback = (done?: DoneCallback) => void | Promise<void>;
  type ProvidesCallback = ((cb: DoneCallback) => void | undefined) | (() => PromiseLike<unknown>);

  interface ItBlock {
    (name: string, fn?: ProvidesCallback, timeout?: number): void;
    only(name: string, fn?: ProvidesCallback, timeout?: number): void;
    skip(name: string, fn?: ProvidesCallback, timeout?: number): void;
    todo(name: string): void;
  }

  interface DescribeBlock {
    (name: string, fn: () => void): void;
    only(name: string, fn: () => void): void;
    skip(name: string, fn?: () => void): void;
    todo(name: string): void;
  }

  interface AsymmetricMatcher {
    asymmetricMatch(other: unknown): boolean;
  }
}

declare const describe: jest.DescribeBlock;
declare const it: jest.ItBlock;
declare const test: jest.ItBlock;
declare const expect: jest.Expect;
declare const beforeEach: (fn: jest.ProvidesCallback, timeout?: number) => void;
declare const afterEach: (fn: jest.ProvidesCallback, timeout?: number) => void;
declare const beforeAll: (fn: jest.ProvidesCallback, timeout?: number) => void;
declare const afterAll: (fn: jest.ProvidesCallback, timeout?: number) => void;

declare global {
  var describe: jest.DescribeBlock;
  var it: jest.ItBlock;
  var test: jest.ItBlock;
  var expect: jest.Expect;
  var beforeEach: (fn: jest.ProvidesCallback, timeout?: number) => void;
  var afterEach: (fn: jest.ProvidesCallback, timeout?: number) => void;
  var beforeAll: (fn: jest.ProvidesCallback, timeout?: number) => void;
  var afterAll: (fn: jest.ProvidesCallback, timeout?: number) => void;
}
