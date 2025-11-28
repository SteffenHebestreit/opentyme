/**
 * @fileoverview React Query hooks for analytics data.
 * 
 * Provides custom hooks for fetching and caching analytics data:
 * - useTimeTrend: Daily hours breakdown
 * - useRevenueByClient: Top clients by revenue
 * - useBillableRatio: Billable vs non-billable percentage
 * - useProjectProfitability: Project profit/loss analysis
 * 
 * All hooks include automatic refetching, caching, and error handling.
 * 
 * @module hooks/api/useAnalytics
 */

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import {
  getTimeTrend,
  getRevenueByClient,
  getBillableRatio,
  getProjectProfitability,
  TimeTrendPoint,
  RevenueByClient,
  BillableRatio,
  ProjectProfitability,
} from '../../api/services/analytics.service';

/**
 * Fetch time tracking trend data
 * 
 * @param days - Number of days to look back (30, 60, or 90)
 * @param options - React Query options
 * @returns Query result with time trend data
 * 
 * @example
 * ```tsx
 * const { data, isLoading, error } = useTimeTrend(30);
 * ```
 */
export const useTimeTrend = (
  days: number = 30,
  options?: { enabled?: boolean }
): UseQueryResult<TimeTrendPoint[], Error> => {
  return useQuery({
    queryKey: ['analytics', 'time-trend', days],
    queryFn: () => getTimeTrend(days),
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    ...options,
  });
};

/**
 * Fetch revenue by top clients
 * 
 * @param limit - Maximum number of clients to return (1-20)
 * @param options - React Query options
 * @returns Query result with revenue by client data
 * 
 * @example
 * ```tsx
 * const { data, isLoading, error } = useRevenueByClient(10);
 * ```
 */
export const useRevenueByClient = (
  limit: number = 10,
  options?: { enabled?: boolean }
): UseQueryResult<RevenueByClient[], Error> => {
  return useQuery({
    queryKey: ['analytics', 'revenue-by-client', limit],
    queryFn: () => getRevenueByClient(limit),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
};

/**
 * Fetch billable vs non-billable hours ratio
 * 
 * @param days - Optional number of days to look back
 * @param options - React Query options
 * @returns Query result with billable ratio data
 * 
 * @example
 * ```tsx
 * const { data, isLoading, error } = useBillableRatio(); // All time
 * const { data } = useBillableRatio(30); // Last 30 days
 * ```
 */
export const useBillableRatio = (
  days?: number,
  options?: { enabled?: boolean }
): UseQueryResult<BillableRatio, Error> => {
  return useQuery({
    queryKey: ['analytics', 'billable-ratio', days],
    queryFn: () => getBillableRatio(days),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
};

/**
 * Fetch project profitability analysis
 * 
 * @param limit - Maximum number of projects to return (1-20)
 * @param options - React Query options
 * @returns Query result with project profitability data
 * 
 * @example
 * ```tsx
 * const { data, isLoading, error } = useProjectProfitability(10);
 * ```
 */
export const useProjectProfitability = (
  limit: number = 10,
  options?: { enabled?: boolean }
): UseQueryResult<ProjectProfitability[], Error> => {
  return useQuery({
    queryKey: ['analytics', 'project-profitability', limit],
    queryFn: () => getProjectProfitability(limit),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
};
