/**
 * Yearly Financial Summary React Query Hook
 * Provides hook for fetching yearly financial summary data using React Query.
 */

import { useQuery } from '@tanstack/react-query';
import { getYearlyFinancialSummary, YearlyFinancialSummary } from '../../api/services/analytics.service';
import { queryKeys } from './queryKeys';

/**
 * Hook for fetching yearly financial summary data.
 * Returns total revenue, expenses, taxes, and net profit for the specified year.
 * 
 * @param year - Year to get summary for (defaults to current year)
 * @returns React Query result containing yearly financial summary
 * 
 * @example
 * const { data, isLoading, error } = useYearlyFinancialSummary(2025);
 * if (data) {
 *   console.log('Total Revenue:', data.total_revenue);
 *   console.log('Net Profit:', data.net_profit);
 * }
 */
export function useYearlyFinancialSummary(year?: number) {
  return useQuery<YearlyFinancialSummary>({
    queryKey: [...queryKeys.analytics.yearlyFinancialSummary, year],
    queryFn: () => getYearlyFinancialSummary(year),
  });
}
