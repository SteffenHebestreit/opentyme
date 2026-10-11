/**
 * @fileoverview Keeps every screen in step with writes.
 *
 * Totals on the dashboard, analytics charts, project budgets, AfA schedules … are
 * all derived from the same records, so a single write (a new time entry, a
 * payment, a rate change) can make many unrelated queries outdated. Listing those
 * dependencies per mutation is what let the dashboard go stale before. Instead,
 * every successful write marks all business data as outdated:
 *
 * - queries on screen refetch right away (in the background — the old data stays
 *   visible until the new data arrives, so nothing flickers);
 * - queries not on screen refetch the next time a page mounts them
 *   (see `refetchOnMount` in queryClient.ts).
 *
 * Writes are detected in one place — the API client's response interceptor — so
 * modals that call services directly are covered as well as `useMutation` hooks.
 * Other open tabs of the app are told via BroadcastChannel and refresh too.
 */

import type { AxiosResponse } from 'axios';
import { queryClient } from './queryClient';

/** Query roots that never depend on business records. */
const STATIC_QUERY_ROOTS = new Set<unknown>(['plugins', 'auth', 'holidays']);

/**
 * POST endpoints that only compute or preview something. Matching them avoids
 * pointless refetches — and a refetch loop if one of them backs a query.
 */
const READ_ONLY_WRITE_ENDPOINTS = [
  /\/preview\b/,
  /\/validate-payment\b/,
  /\/analyze-receipt\b/,
  /\/analyze-depreciation\b/,
  /\/test-smtp\b/,
  /^\/?auth\//,
  /^\/?ai\//,
];

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);
const CHANNEL_NAME = 'opentyme:data-changed';
const DEBOUNCE_MS = 60;

let pending: ReturnType<typeof setTimeout> | null = null;
let channel: BroadcastChannel | null = null;

function invalidateBusinessData() {
  void queryClient.invalidateQueries(
    { predicate: (query) => !STATIC_QUERY_ROOTS.has(query.queryKey[0]) },
    // A refetch already in flight was started after the write — keep it.
    { cancelRefetch: false }
  );
}

/**
 * Mark all business data as outdated. Bursts of writes (a batch delete, an
 * approval that applies several AI actions) collapse into one refresh.
 *
 * @param broadcast - also tell the app's other tabs (default true)
 */
export function notifyDataChanged(broadcast = true): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    invalidateBusinessData();
    if (broadcast) channel?.postMessage({ at: Date.now() });
  }, DEBOUNCE_MS);
}

/** Whether a finished API response represents a write to business data. */
export function isDataWrite(response: Pick<AxiosResponse, 'config' | 'status'>): boolean {
  const method = response.config.method?.toLowerCase() ?? 'get';
  if (!MUTATING_METHODS.has(method)) return false;
  if (response.status < 200 || response.status >= 300) return false;
  const url = response.config.url ?? '';
  return !READ_ONLY_WRITE_ENDPOINTS.some((pattern) => pattern.test(url));
}

/** Start listening for writes made in the app's other tabs. Call once at startup. */
export function installCrossTabSync(): () => void {
  if (typeof BroadcastChannel === 'undefined' || channel) return () => undefined;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = () => notifyDataChanged(false);
  return () => {
    channel?.close();
    channel = null;
  };
}
