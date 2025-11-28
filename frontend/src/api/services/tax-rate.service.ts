import apiClient from './client';
import { TaxRate, TaxRatePayload } from '../types';

/**
 * API service for tax rate management.
 * Provides methods to interact with the tax rate endpoints.
 */

/**
 * Fetches all tax rates for the authenticated user.
 * 
 * @param {boolean} [activeOnly=false] - If true, only fetch active tax rates
 * @returns {Promise<TaxRate[]>} Array of tax rates
 */
export const getTaxRates = async (activeOnly: boolean = false): Promise<TaxRate[]> => {
  const params = activeOnly ? { active_only: 'true' } : {};
  const response = await apiClient.get('/admin/tax-rates', { params });
  return response.data;
};

/**
 * Fetches a single tax rate by ID.
 * 
 * @param {string} id - The UUID of the tax rate
 * @returns {Promise<TaxRate>} The tax rate
 */
export const getTaxRate = async (id: string): Promise<TaxRate> => {
  const response = await apiClient.get(`/admin/tax-rates/${id}`);
  return response.data;
};

/**
 * Fetches the default tax rate for the authenticated user.
 * 
 * @returns {Promise<TaxRate | null>} The default tax rate, or null if not set
 */
export const getDefaultTaxRate = async (): Promise<TaxRate | null> => {
  try {
    const response = await apiClient.get('/admin/tax-rates/default');
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
};

/**
 * Creates a new tax rate.
 * 
 * @param {TaxRatePayload} data - The tax rate data
 * @returns {Promise<TaxRate>} The created tax rate
 */
export const createTaxRate = async (data: TaxRatePayload): Promise<TaxRate> => {
  const response = await apiClient.post('/admin/tax-rates', data);
  return response.data.taxRate;
};

/**
 * Updates an existing tax rate.
 * 
 * @param {string} id - The UUID of the tax rate to update
 * @param {Partial<TaxRatePayload>} data - The partial tax rate data to update
 * @returns {Promise<TaxRate>} The updated tax rate
 */
export const updateTaxRate = async (
  id: string,
  data: Partial<TaxRatePayload>
): Promise<TaxRate> => {
  const response = await apiClient.put(`/admin/tax-rates/${id}`, data);
  return response.data.taxRate;
};

/**
 * Sets a tax rate as the default for the user.
 * 
 * @param {string} id - The UUID of the tax rate to set as default
 * @returns {Promise<TaxRate>} The updated tax rate
 */
export const setDefaultTaxRate = async (id: string): Promise<TaxRate> => {
  const response = await apiClient.patch(`/admin/tax-rates/${id}/set-default`);
  return response.data.taxRate;
};

/**
 * Deletes a tax rate.
 * Only succeeds if the tax rate is not currently used by any invoices.
 * 
 * @param {string} id - The UUID of the tax rate to delete
 * @returns {Promise<void>}
 */
export const deleteTaxRate = async (id: string): Promise<void> => {
  await apiClient.delete(`/admin/tax-rates/${id}`);
};
