/**
 * Minimal bounded LRU map for per-conversation in-memory caches. True LRU:
 * both reads and writes refresh recency (a plain bounded Map evicts FIFO by
 * first insertion, which throws out the *most active* long-lived entry first —
 * exactly the wrong one for prefix-cache stability).
 */

export class BoundedLru<V> {
  private map = new Map<string, V>();

  constructor(private readonly maxSize: number) {}

  get(key: string): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, value); // refresh recency
    return value;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key); // refresh recency on update
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }
}
