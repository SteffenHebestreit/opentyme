import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getInvoiceTextTemplates,
  getInvoiceTextTemplate,
  getDefaultInvoiceTextTemplates,
  createInvoiceTextTemplate,
  updateInvoiceTextTemplate,
  deleteInvoiceTextTemplate
} from '../../api/services/invoice-text-template.service';
import { InvoiceTextTemplatePayload, TemplateCategory } from '../../api/types';

/**
 * Hook to fetch all invoice text templates.
 * 
 * @param {TemplateCategory} [category] - Optional category filter
 * @param {boolean} [activeOnly=false] - If true, only fetch active templates
 */
export const useInvoiceTextTemplates = (
  category?: TemplateCategory,
  activeOnly: boolean = false
) => {
  return useQuery({
    queryKey: ['invoiceTextTemplates', category, activeOnly],
    queryFn: () => getInvoiceTextTemplates(category, activeOnly),
  });
};

/**
 * Hook to fetch a single invoice text template by ID.
 * 
 * @param {string} id - The UUID of the template
 */
export const useInvoiceTextTemplate = (id: string) => {
  return useQuery({
    queryKey: ['invoiceTextTemplate', id],
    queryFn: () => getInvoiceTextTemplate(id),
    enabled: !!id,
  });
};

/**
 * Hook to fetch all default invoice text templates.
 */
export const useDefaultInvoiceTextTemplates = () => {
  return useQuery({
    queryKey: ['defaultInvoiceTextTemplates'],
    queryFn: getDefaultInvoiceTextTemplates,
  });
};

/**
 * Hook to create a new invoice text template.
 */
export const useCreateInvoiceTextTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InvoiceTextTemplatePayload) => createInvoiceTextTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoiceTextTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['defaultInvoiceTextTemplates'] });
    },
  });
};

/**
 * Hook to update an existing invoice text template.
 */
export const useUpdateInvoiceTextTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InvoiceTextTemplatePayload> }) =>
      updateInvoiceTextTemplate(id, data),
    onSuccess: (_data: any, variables: { id: string; data: Partial<InvoiceTextTemplatePayload> }) => {
      queryClient.invalidateQueries({ queryKey: ['invoiceTextTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['invoiceTextTemplate', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['defaultInvoiceTextTemplates'] });
    },
  });
};

/**
 * Hook to delete an invoice text template.
 */
export const useDeleteInvoiceTextTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteInvoiceTextTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoiceTextTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['defaultInvoiceTextTemplates'] });
    },
  });
};
