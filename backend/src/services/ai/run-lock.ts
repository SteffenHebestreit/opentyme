/**
 * One active assistant run per conversation.
 *
 * Two overlapping runs on the same thread (double submit, a second tab, an
 * approve click while the previous answer is still streaming) interleave their
 * persisted messages — e.g. assistant(tool_calls) → user → tool — and can race
 * each other's approval claims. Runs therefore take a per-conversation lock;
 * a second request gets HTTP 409 RUN_IN_PROGRESS before its SSE stream starts.
 *
 * In-process on purpose: the backend runs as a single instance (the same
 * assumption the sticky-tool and history-anchor caches make), and an in-memory
 * set needs no pooled DB connection held open for the length of a run. The key
 * includes the user id, so another user can neither block nor probe a thread.
 */

const activeRuns = new Set<string>();

export function runLockKey(userId: string, conversationId: string): string {
  return `${userId}:${conversationId.toLowerCase()}`;
}

/** Takes the lock; returns false when a run for this key is already active. */
export function tryAcquireRunLock(key: string): boolean {
  if (activeRuns.has(key)) return false;
  activeRuns.add(key);
  return true;
}

export function releaseRunLock(key: string): void {
  activeRuns.delete(key);
}

export function isRunActive(key: string): boolean {
  return activeRuns.has(key);
}
