/**
 * @fileoverview Tax Prepayment API Service
 * 
 * API client for tax prepayment operations.
 */

import api from './client';
import {
  TaxPrepayment,
  CreateTaxPrepaymentData,
  UpdateTaxPrepaymentData,
  TaxPrepaymentFilters,
  TaxPrepaymentSummary,
} from '../types/tax-prepayment.types';

/**
 * Get all tax prepayments with filtering
 */
export const getTaxPrepayments = async (
  filters?: TaxPrepaymentFilters
): Promise<{ prepayments: TaxPrepayment[]; total: number }> => {
  const response = await api.get('/tax-prepayments', { params: filters });
  return response.data;
};

/**
 * Get single tax prepayment by ID
 */
export const getTaxPrepaymentById = async (id: string): Promise<TaxPrepayment> => {
  const response = await api.get(`/tax-prepayments/${id}`);
  return response.data;
};

/**
 * Get tax prepayment summary
 */
export const getTaxPrepaymentSummary = async (taxYear?: number): Promise<TaxPrepaymentSummary> => {
  const response = await api.get('/tax-prepayments/summary', {
    params: taxYear ? { tax_year: taxYear } : undefined,
  });
  return response.data;
};

/**
 * Create new tax prepayment
 */
export const createTaxPrepayment = async (data: CreateTaxPrepaymentData): Promise<TaxPrepayment> => {
  const response = await api.post('/tax-prepayments', data);
  return response.data;
};

/**
 * Update tax prepayment
 */
export const updateTaxPrepayment = async (
  id: string,
  data: UpdateTaxPrepaymentData
): Promise<TaxPrepayment> => {
  const response = await api.put(`/tax-prepayments/${id}`, data);
  return response.data;
};

/**
 * Delete tax prepayment
 */
export const deleteTaxPrepayment = async (id: string): Promise<void> => {
  await api.delete(`/tax-prepayments/${id}`);
};

/**
 * Upload receipt for tax prepayment
 */
export const uploadReceipt = async (id: string, file: File): Promise<TaxPrepayment> => {
  const formData = new FormData();
  formData.append('receipt', file);

  const response = await api.post(`/tax-prepayments/${id}/receipt`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

/**
 * Delete receipt from tax prepayment
 */
export const deleteReceipt = async (id: string): Promise<TaxPrepayment> => {
  const response = await api.delete(`/tax-prepayments/${id}/receipt`);
  return response.data;
};
