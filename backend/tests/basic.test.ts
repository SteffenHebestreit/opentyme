/**
 * Simple Jest test to verify testing infrastructure works
 */

describe('Basic Jest Setup', () => {
  it('should run a simple test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should test string operations', () => {
    expect('hello world').toContain('world');
    expect('hello world'.length).toBe(11);
  });

  it('should test array operations', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(arr).toHaveLength(5);
    expect(arr).toContain(3);
  });

  it('should test async operations', async () => {
    const promise = Promise.resolve('test');
    await expect(promise).resolves.toBe('test');
  });
});