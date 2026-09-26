/**
 * A tiny concurrency pool: run `worker(item)` over `items` with at most
 * `limit` in flight, preserving input order in the result array.
 *
 * Kept local (rather than pulling in p-limit) because we only need it for
 * the poller and its siblings. Semantics match p-limit's `limit(n)` +
 * `.map()` combo for the cases we care about.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (limit <= 0) throw new Error("runWithConcurrency: limit must be > 0");
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function next(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }

  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => next()));
  return results;
}
