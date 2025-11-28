/**
 * Payment React Query Hooks
 * Provides hooks for managing payments using React Query.
 * Handles payment data fetching, caching, mutations, and automatic cache invalidation.
 * Supports payment tracking for invoices and CRUD operations.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createPayment,
  deletePayment,
  fetchPayment,
  fetchPayments,
  fetchPaymentsByInvoice,
  updatePayment,
} from '../../api/services/payment.service';
import { Payment, PaymentPayload } from '../../api/types';
import { queryKeys } from './queryKeys';

/**
 * Hook for fetching all payments.
 * Results are ordered by payment date (newest first).
 * Results are cached by React Query.
 * 
 * @returns {UseQueryResult<Payment[]>} React Query result containing payments array
 * 
 * @example
 * const { data: payments, isLoading } = usePayments();
 * if (payments) {
 *   payments.forEach(payment => console.log(payment.amount, payment.status));
 * }
 */
export function usePayments() {
  return useQuery<Payment[]>({
    queryKey: queryKeys.payments.all,
    queryFn: fetchPayments,
  });
}

/**
 * Hook for fetching a single payment by ID.
 * Query is automatically disabled if ID is undefined.
 * 
 * @param {string | undefined} id - UUID of the payment
 * @returns {UseQueryResult<Payment>} React Query result containing the payment
 * 
 * @example
 * const { data: payment, isLoading } = usePayment(paymentId);
 * if (payment) {
 *   console.log('Amount:', payment.amount, 'Status:', payment.status);
 * }
 */
export function usePayment(id: string | undefined) {
  return useQuery<Payment>({
    queryKey: queryKeys.payments.detail(id ?? 'pending'),
    queryFn: () => fetchPayment(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Hook for fetching all payments for a specific invoice.
 * Useful for displaying payment history and calculating outstanding balances.
 * Query is automatically disabled if invoiceId is undefined.
 * 
 * @param {string | undefined} invoiceId - UUID of the invoice
 * @returns {UseQueryResult<Payment[]>} React Query result containing invoice payments
 * 
 * @example
 * const { data: payments } = usePaymentsByInvoice(invoiceId);
 * if (payments) {
 *   const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
 *   console.log('Total paid:', totalPaid);
 * }
 */
export function usePaymentsByInvoice(invoiceId: string | undefined) {
  return useQuery<Payment[]>({
    queryKey: queryKeys.payments.invoice(invoiceId ?? 'pending'),
    queryFn: () => fetchPaymentsByInvoice(invoiceId as string),
    enabled: Boolean(invoiceId),
  });
}

/**
 * Hook for creating a new payment.
 * Automatically invalidates the payments list cache on success.
 * 
 * @returns {UseMutationResult} React Query mutation result
 * 
 * @example
 * const createMutation = useCreatePayment();
 * 
 * const handleCreate = () => {
 *   createMutation.mutate({
 *     invoice_id: 'uuid',
 *     amount: 500.00,
 *     payment_date: new Date(),
 *     payment_method: 'credit_card',
 *     status: 'completed'
 *   });
 * };
 */
export function useCreatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PaymentPayload) => createPayment(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary });
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
    },
  });
}

/**
 * Hook for updating an existing payment.
 * Supports partial updates (only provided fields are updated).
 * Automatically invalidates the payments list and detail caches on success.
 * 
 * @returns {UseMutationResult} React Query mutation result
 * 
 * @example
 * const updateMutation = useUpdatePayment();
 * 
 * const handleUpdate = (id: string) => {
 *   updateMutation.mutate({ 
 *     id, 
 *     payload: { 
 *       status: 'completed',
 *       notes: 'Payment confirmed' 
 *     } 
 *   });
 * };
 */
export function useUpdatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<PaymentPayload> }) =>
      updatePayment(id, payload),
    onSuccess: (_payment: Payment, variables: { id: string; payload: Partial<PaymentPayload> }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.detail(variables.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary });
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
    },
  });
}

/**
 * Hook for deleting a payment.
 * This action cannot be undone.
 * Automatically invalidates the payments list cache on success.
 * 
 * @returns {UseMutationResult} React Query mutation result
 * 
 * @example
 * const deleteMutation = useDeletePayment();
 * 
 * const handleDelete = (id: string) => {
 *   if (confirm('Delete this payment? This cannot be undone.')) {
 *     deleteMutation.mutate(id);
 *   }
 * };
 */
export function useDeletePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePayment(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary });
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
    },
  });
}

