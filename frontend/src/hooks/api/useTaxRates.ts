import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTaxRates,
  getTaxRate,
  getDefaultTaxRate,
  createTaxRate,
  updateTaxRate,
  setDefaultTaxRate,
  deleteTaxRate
} from '../../api/services/tax-rate.service';
import { TaxRatePayload } from '../../api/types';

/**
 * Hook to fetch all tax rates.
 * 
 * @param {boolean} [activeOnly=false] - If true, only fetch active tax rates
 */
export const useTaxRates = (activeOnly: boolean = false) => {
  return useQuery({
    queryKey: ['taxRates', activeOnly],
    queryFn: () => getTaxRates(activeOnly),
  });
};

/**
 * Hook to fetch a single tax rate by ID.
 * 
 * @param {string} id - The UUID of the tax rate
 */
export const useTaxRate = (id: string) => {
  return useQuery({
    queryKey: ['taxRate', id],
    queryFn: () => getTaxRate(id),
    enabled: !!id,
  });
};

/**
 * Hook to fetch the default tax rate.
 */
export const useDefaultTaxRate = () => {
  return useQuery({
    queryKey: ['defaultTaxRate'],
    queryFn: getDefaultTaxRate,
  });
};

/**
 * Hook to create a new tax rate.
 */
export const useCreateTaxRate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TaxRatePayload) => createTaxRate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxRates'] });
      queryClient.invalidateQueries({ queryKey: ['defaultTaxRate'] });
    },
  });
};

/**
 * Hook to update an existing tax rate.
 */
export const useUpdateTaxRate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TaxRatePayload> }) =>
      updateTaxRate(id, data),
    onSuccess: (_data: any, variables: { id: string; data: Partial<TaxRatePayload> }) => {
      queryClient.invalidateQueries({ queryKey: ['taxRates'] });
      queryClient.invalidateQueries({ queryKey: ['taxRate', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['defaultTaxRate'] });
    },
  });
};

/**
 * Hook to set a tax rate as default.
 */
export const useSetDefaultTaxRate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => setDefaultTaxRate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxRates'] });
      queryClient.invalidateQueries({ queryKey: ['defaultTaxRate'] });
    },
  });
};

/**
 * Hook to delete a tax rate.
 */
export const useDeleteTaxRate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTaxRate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxRates'] });
      queryClient.invalidateQueries({ queryKey: ['defaultTaxRate'] });
    },
  });
};
