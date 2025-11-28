/**
 * @fileoverview React Query hooks for depreciation analysis and management
 *
 * Provides hooks for:
 * - AI-powered depreciation analysis
 * - Updating depreciation settings
 * - Fetching depreciation schedules
 *
 * @module hooks/api/useDepreciation
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/services/client';
import { queryKeys } from './queryKeys';

/**
 * Depreciation analysis result from AI
 */
export interface DepreciationAnalysis {
  eligible: boolean;
  reason?: string;
  analysis?: {
    recommendation: 'immediate' | 'partial';
    depreciation_type: 'immediate' | 'partial';
    depreciation_years: number | null;
    useful_life_category: string;
    suggested_category?: string; // AI-suggested expense category
    category_reasoning?: string; // Why this category was suggested
    confidence: number;
    reasoning: string;
    tax_impact: {
      first_year_deduction: number;
      deferred_amount: number;
    };
    tax_deductible_percentage?: number; // 0-100
    tax_deductibility_reasoning?: string;
    references?: string[];
  };
}

/**
 * Depreciation settings for updating an expense
 */
export interface DepreciationSettings {
  depreciation_type: 'none' | 'immediate' | 'partial';
  depreciation_years?: number;
  depreciation_start_date?: string;
  depreciation_method?: 'linear' | 'degressive';
  useful_life_category?: string;
}

/**
 * Depreciation schedule entry
 */
export interface DepreciationScheduleEntry {
  year: number;
  amount: number;
  cumulative_amount: number;
  remaining_value: number;
  is_final_year: boolean;
}

/**
 * Depreciation schedule response
 */
export interface DepreciationScheduleResponse {
  expense: {
    id: string;
    description: string;
    net_amount: number;
    depreciation_type: string;
    depreciation_years: number | null;
    depreciation_start_date: string | null;
    tax_deductible_amount: number | null;
  };
  schedule: DepreciationScheduleEntry[];
}

/**
 * Hook to analyze an expense for depreciation using AI
 *
 * @param {string} expenseId - Expense ID to analyze
 * @returns Mutation for triggering analysis
 *
 * @example
 * const { mutate: analyze, isLoading, data } = useAnalyzeDepreciation(expenseId);
 * analyze();
 */
export function useAnalyzeDepreciation(expenseId: string) {
  const queryClient = useQueryClient();

  return useMutation<DepreciationAnalysis, Error>({
    mutationFn: async () => {
      const response = await api.post(`/expenses/${expenseId}/analyze-depreciation`);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate expense queries to refresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.detail(expenseId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.list() });
    },
    onError: (error) => {
      console.error('[useAnalyzeDepreciation] Error:', error);
    },
  });
}

/**
 * Hook to update depreciation settings for an expense
 *
 * @param {string} expenseId - Expense ID to update
 * @returns Mutation for updating depreciation settings
 *
 * @example
 * const { mutate: updateSettings } = useUpdateDepreciation(expenseId);
 * updateSettings({
 *   depreciation_type: 'partial',
 *   depreciation_years: 3,
 *   depreciation_start_date: '2025-01-01'
 * });
 */
export function useUpdateDepreciation(expenseId: string) {
  const queryClient = useQueryClient();

  return useMutation<any, Error, DepreciationSettings>({
    mutationFn: async (settings: DepreciationSettings) => {
      const response = await api.put(`/expenses/${expenseId}/depreciation`, settings);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.detail(expenseId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.depreciation.schedule(expenseId) });
    },
    onError: (error) => {
      console.error('[useUpdateDepreciation] Error:', error);
    },
  });
}

/**
 * Hook to fetch depreciation schedule for an expense
 *
 * @param {string} expenseId - Expense ID
 * @param {boolean} enabled - Whether to fetch (default: true)
 * @returns Query result with depreciation schedule
 *
 * @example
 * const { data: schedule, isLoading } = useDepreciationSchedule(expenseId);
 */
export function useDepreciationSchedule(expenseId: string, enabled = true) {
  return useQuery<DepreciationScheduleResponse, Error>({
    queryKey: queryKeys.depreciation.schedule(expenseId),
    queryFn: async () => {
      const response = await api.get(`/expenses/${expenseId}/depreciation-schedule`);
      return response.data;
    },
    enabled: enabled && !!expenseId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
