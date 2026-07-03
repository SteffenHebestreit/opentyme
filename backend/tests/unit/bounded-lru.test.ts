/**
 * BoundedLru — verifies true LRU semantics (the flaw it replaced was FIFO
 * eviction that threw out the most-active entry first).
 */

import { BoundedLru } from '../../src/utils/bounded-lru';

describe('BoundedLru', () => {
  it('stores and retrieves values', () => {
    const lru = new BoundedLru<number>(2);
    lru.set('a', 1);
    expect(lru.get('a')).toBe(1);
    expect(lru.get('missing')).toBeUndefined();
  });

  it('evicts the least-recently-USED entry, not the first-inserted', () => {
    const lru = new BoundedLru<number>(2);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.get('a'); // refresh a — b is now least recently used
    lru.set('c', 3); // evicts b, NOT a
    expect(lru.get('a')).toBe(1);
    expect(lru.get('b')).toBeUndefined();
    expect(lru.get('c')).toBe(3);
  });

  it('refreshes recency on update (set of an existing key)', () => {
    const lru = new BoundedLru<number>(2);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('a', 10); // update refreshes a
    lru.set('c', 3); // evicts b
    expect(lru.get('a')).toBe(10);
    expect(lru.get('b')).toBeUndefined();
  });
});
