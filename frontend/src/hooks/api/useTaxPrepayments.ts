/**
 * @fileoverview Tax Prepayment React Query Hooks
 * 
 * Custom hooks for tax prepayment data fetching and mutations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTaxPrepayments,
  getTaxPrepaymentById,
  getTaxPrepaymentSummary,
  createTaxPrepayment,
  updateTaxPrepayment,
  deleteTaxPrepayment,
  uploadReceipt,
  deleteReceipt,
} from '@/api/services/tax-prepayment.service';
import {
  CreateTaxPrepaymentData,
  UpdateTaxPrepaymentData,
  TaxPrepaymentFilters,
} from '@/api/types/tax-prepayment.types';

/**
 * Hook to fetch tax prepayments with filtering
 */
export const useTaxPrepayments = (filters?: TaxPrepaymentFilters) => {
  return useQuery({
    queryKey: ['tax-prepayments', filters],
    queryFn: () => getTaxPrepayments(filters),
  });
};

/**
 * Hook to fetch single tax prepayment
 */
export const useTaxPrepayment = (id: string) => {
  return useQuery({
    queryKey: ['tax-prepayment', id],
    queryFn: () => getTaxPrepaymentById(id),
    enabled: !!id,
  });
};

/**
 * Hook to fetch tax prepayment summary
 */
export const useTaxPrepaymentSummary = (taxYear?: number) => {
  return useQuery({
    queryKey: ['tax-prepayment-summary', taxYear],
    queryFn: () => getTaxPrepaymentSummary(taxYear),
  });
};

/**
 * Hook to create tax prepayment
 */
export const useCreateTaxPrepayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTaxPrepaymentData) => createTaxPrepayment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-prepayments'] });
      queryClient.invalidateQueries({ queryKey: ['tax-prepayment-summary'] });
    },
  });
};

/**
 * Hook to update tax prepayment
 */
export const useUpdateTaxPrepayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaxPrepaymentData }) =>
      updateTaxPrepayment(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tax-prepayments'] });
      queryClient.invalidateQueries({ queryKey: ['tax-prepayment', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['tax-prepayment-summary'] });
    },
  });
};

/**
 * Hook to delete tax prepayment
 */
export const useDeleteTaxPrepayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTaxPrepayment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-prepayments'] });
      queryClient.invalidateQueries({ queryKey: ['tax-prepayment-summary'] });
    },
  });
};

/**
 * Hook to upload receipt
 */
export const useUploadReceipt = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadReceipt(id, file),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tax-prepayments'] });
      queryClient.invalidateQueries({ queryKey: ['tax-prepayment', variables.id] });
    },
  });
};

/**
 * Hook to delete receipt
 */
export const useDeleteReceipt = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteReceipt(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['tax-prepayments'] });
      queryClient.invalidateQueries({ queryKey: ['tax-prepayment', id] });
    },
  });
};
