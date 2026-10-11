/**
 * Table-driven tests. `it.each` is missing from the jest typings this project
 * compiles tests against, so this small stand-in registers one `it` per row.
 * The title supports the printf-style placeholders %s, %p, %d and %i.
 */
export function each(table: ReadonlyArray<ReadonlyArray<unknown>>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (title: string, fn: (...args: any[]) => unknown): void => {
    for (const row of table) {
      let index = 0;
      const name = title.replace(/%[spdi]/g, () => {
        const value = row[index++];
        if (typeof value === 'string') return value;
        if (value instanceof Error) return value.message;
        return JSON.stringify(value) ?? String(value);
      });
      it(name, async () => {
        await fn(...row);
      });
    }
  };
}
