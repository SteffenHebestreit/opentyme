/**
 * Dashboard React Query Hook
 * Provides hook for fetching dashboard summary data using React Query.
 * Handles data fetching, caching, and automatic refetching of dashboard statistics.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchDashboardData } from '../../api/services/dashboard.service';
import { DashboardData } from '../../api/types';
import { queryKeys } from './queryKeys';

/**
 * Hook for fetching dashboard summary data.
 * Returns aggregated statistics including active projects, recent time entries,
 * pending invoices, and revenue metrics.
 * Results are cached by React Query.
 * 
 * @returns {UseQueryResult<DashboardData>} React Query result containing dashboard data
 * 
 * @example
 * const { data: dashboard, isLoading, error } = useDashboard();
 * if (dashboard) {
 *   console.log('Active projects:', dashboard.activeProjects);
 *   console.log('Total revenue:', dashboard.totalRevenue);
 * }
 */
export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: queryKeys.dashboard.summary,
    queryFn: fetchDashboardData,
  });
}

