/**
 * @fileoverview The app-wide React Query client.
 *
 * Lives in its own module (instead of main.tsx) so non-React code — the API
 * client's response interceptor, the AI chat stream — can mark data as changed.
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Coming back to the tab refetches only data older than staleTime — picks up
      // changes made on another device or by the AI assistant in the meantime.
      refetchOnWindowFocus: true,
      // Don't refetch just because a page mounts and data exists — EXCEPT when a
      // change explicitly invalidated it. Plain `false` also swallowed those:
      // invalidateQueries only refetches queries that are on screen, so a page
      // opened afterwards (e.g. the dashboard after a rate change re-priced time
      // entries) kept showing its old totals for up to gcTime.
      refetchOnMount: (query) => query.state.isInvalidated,
      staleTime: 2 * 60 * 1000, // Consider data fresh for 2 minutes (shorter than token expiry)
      gcTime: 5 * 60 * 1000, // Keep unused data in cache for 5 minutes (renamed from cacheTime in v5)
      retry: 1, // Only retry once on failure
      retryDelay: 1000, // Wait 1 second before retry
    },
  },
});
