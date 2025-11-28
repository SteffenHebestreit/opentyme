import apiClient from './client';
import { Payment, PaymentPayload, PaymentResponse } from '../types';

export async function fetchPayments(): Promise<Payment[]> {
  const { data } = await apiClient.get<Payment[]>('/payments');
  return data;
}

export async function fetchPayment(id: string): Promise<Payment> {
  const { data } = await apiClient.get<Payment>(`/payments/${id}`);
  return data;
}

export async function createPayment(payload: PaymentPayload): Promise<Payment> {
  const { data } = await apiClient.post<PaymentResponse>('/payments', payload);
  return data.payment;
}

export async function updatePayment(
  id: string,
  payload: Partial<PaymentPayload>
): Promise<Payment> {
  const { data } = await apiClient.put<PaymentResponse>(`/payments/${id}`, payload);
  return data.payment;
}

export async function deletePayment(id: string): Promise<void> {
  await apiClient.delete(`/payments/${id}`);
}

export async function fetchPaymentsByInvoice(invoiceId: string): Promise<Payment[]> {
  const { data } = await apiClient.get<Payment[]>(`/payments/invoice/${invoiceId}`);
  return data;
}
