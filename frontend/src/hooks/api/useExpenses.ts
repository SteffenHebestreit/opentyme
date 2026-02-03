/**
 * @fileoverview React Query hooks for expense operations
 * 
 * Provides hooks for:
 * - Fetching expenses (with filters)
 * - Creating expenses
 * - Updating expenses
 * - Deleting expenses
 * - Managing receipts
 * - Expense approvals
 * 
 * @module hooks/api/useExpenses
 */

import { useQuery, useMutation, useQueryClient, UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import api from '@/api/services/client';
import {
  fetchExpenses,
  fetchExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  uploadReceipt,
  deleteReceipt,
  approveExpense,
  fetchExpenseSummary,
  triggerRecurringExpenses,
} from '@/api/services/expense.service';
import type {
  Expense,
  ExpenseFilters,
  ExpenseSummary,
  CreateExpenseData,
  UpdateExpenseData,
} from '@/api/types';

/**
 * Hook to fetch all expenses with optional filters
 * 
 * @param {ExpenseFilters} filters - Optional filters
 * @returns {UseQueryResult<Expense[], Error>} Query result with expenses
 */
export const useExpenses = (filters?: ExpenseFilters): UseQueryResult<Expense[], Error> => {
  return useQuery({
    queryKey: ['expenses', filters],
    queryFn: () => fetchExpenses(filters),
    staleTime: 30000, // 30 seconds
  });
};

/**
 * Hook to fetch a single expense by ID
 * 
 * @param {string} expenseId - Expense UUID
 * @param {boolean} enabled - Whether to enable the query
 * @returns {UseQueryResult<Expense, Error>} Query result with expense
 */
export const useExpense = (expenseId: string, enabled = true): UseQueryResult<Expense, Error> => {
  return useQuery({
    queryKey: ['expenses', expenseId],
    queryFn: () => fetchExpenseById(expenseId),
    enabled: enabled && !!expenseId,
    staleTime: 30000,
  });
};

/**
 * Hook to fetch expense summary statistics
 * 
 * @param {ExpenseFilters} filters - Optional filters
 * @returns {UseQueryResult<ExpenseSummary, Error>} Query result with summary
 */
export const useExpenseSummary = (filters?: ExpenseFilters): UseQueryResult<ExpenseSummary, Error> => {
  return useQuery({
    queryKey: ['expenses', 'summary', filters],
    queryFn: () => fetchExpenseSummary(filters),
    staleTime: 30000,
  });
};

/**
 * Hook to create a new expense
 * 
 * @returns {UseMutationResult} Mutation result for creating expense
 */
export const useCreateExpense = (): UseMutationResult<Expense, Error, CreateExpenseData> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      // Invalidate all expense queries
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
};

/**
 * Hook to update an existing expense
 * 
 * @returns {UseMutationResult} Mutation result for updating expense
 */
export const useUpdateExpense = (): UseMutationResult<
  Expense,
  Error,
  { expenseId: string; data: UpdateExpenseData }
> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ expenseId, data }) => updateExpense(expenseId, data),
    onSuccess: (_, variables) => {
      // Invalidate all expense queries and the specific expense
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expenses', variables.expenseId] });
    },
  });
};

/**
 * Hook to delete an expense
 * 
 * @returns {UseMutationResult} Mutation result for deleting expense
 */
export const useDeleteExpense = (): UseMutationResult<void, Error, string> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteExpense,
    onSuccess: () => {
      // Invalidate all expense queries
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
};

/**
 * Hook to upload a receipt file
 * 
 * @returns {UseMutationResult} Mutation result for uploading receipt
 */
export const useUploadReceipt = (): UseMutationResult<
  { url: string; filename: string },
  Error,
  { expenseId: string; file: File }
> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ expenseId, file }) => uploadReceipt(expenseId, file),
    onSuccess: (_, variables) => {
      // Invalidate the specific expense query
      queryClient.invalidateQueries({ queryKey: ['expenses', variables.expenseId] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
};

/**
 * Hook to delete a receipt file
 * 
 * @returns {UseMutationResult} Mutation result for deleting receipt
 */
export const useDeleteReceipt = (): UseMutationResult<void, Error, string> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteReceipt,
    onSuccess: (_, expenseId) => {
      // Invalidate the specific expense query
      queryClient.invalidateQueries({ queryKey: ['expenses', expenseId] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
};

/**
 * Hook to approve or reject an expense (admin only)
 * 
 * @returns {UseMutationResult} Mutation result for approving expense
 */
export const useApproveExpense = (): UseMutationResult<
  Expense,
  Error,
  { expenseId: string; status: 'approved' | 'rejected'; notes?: string }
> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ expenseId, status, notes }) => approveExpense(expenseId, status, notes),
    onSuccess: (_, variables) => {
      // Invalidate all expense queries and the specific expense
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expenses', variables.expenseId] });
    },
  });
};

/**
 * Hook to fetch generated expenses from a recurring template
 */
export const useRecurringGeneratedExpenses = (expenseId: string, enabled: boolean = true): UseQueryResult<Expense[], Error> => {
  return useQuery({
    queryKey: ['expenses', expenseId, 'generated'],
    queryFn: async () => {
      const response = await api.get(`/expenses/${expenseId}/generated`);
      return response.data;
    },
    enabled,
    staleTime: 30000, // 30 seconds
  });
};
/**
 * Hook to manually trigger recurring expense processing
 * Useful for catching up on missed recurring expense generations
 * 
 * @returns {UseMutationResult} Mutation result for triggering
 */
export const useTriggerRecurringExpenses = (): UseMutationResult<
  { success: boolean; message: string },
  Error,
  void
> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: triggerRecurringExpenses,
    onSuccess: () => {
      // Invalidate all expense queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
};