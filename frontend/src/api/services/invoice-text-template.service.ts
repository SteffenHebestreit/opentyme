import apiClient from './client';
import { InvoiceTextTemplate, InvoiceTextTemplatePayload, TemplateCategory } from '../types';

/**
 * API service for invoice text template management.
 * Provides methods to interact with the invoice text template endpoints.
 */

/**
 * Fetches all invoice text templates for the authenticated user.
 * 
 * @param {TemplateCategory} [category] - Optional category filter
 * @param {boolean} [activeOnly=false] - If true, only fetch active templates
 * @returns {Promise<InvoiceTextTemplate[]>} Array of templates
 */
export const getInvoiceTextTemplates = async (
  category?: TemplateCategory,
  activeOnly: boolean = false
): Promise<InvoiceTextTemplate[]> => {
  const params: any = {};
  if (category) params.category = category;
  if (activeOnly) params.active_only = 'true';
  
  const response = await apiClient.get('/admin/invoice-templates', { params });
  return response.data;
};

/**
 * Fetches a single invoice text template by ID.
 * 
 * @param {string} id - The UUID of the template
 * @returns {Promise<InvoiceTextTemplate>} The template
 */
export const getInvoiceTextTemplate = async (id: string): Promise<InvoiceTextTemplate> => {
  const response = await apiClient.get(`/admin/invoice-templates/${id}`);
  return response.data;
};

/**
 * Fetches all default templates for the authenticated user.
 * Returns one template per category if a default is set.
 * 
 * @returns {Promise<InvoiceTextTemplate[]>} Array of default templates
 */
export const getDefaultInvoiceTextTemplates = async (): Promise<InvoiceTextTemplate[]> => {
  const response = await apiClient.get('/admin/invoice-templates/defaults');
  return response.data;
};

/**
 * Creates a new invoice text template.
 * 
 * @param {InvoiceTextTemplatePayload} data - The template data
 * @returns {Promise<InvoiceTextTemplate>} The created template
 */
export const createInvoiceTextTemplate = async (
  data: InvoiceTextTemplatePayload
): Promise<InvoiceTextTemplate> => {
  const response = await apiClient.post('/admin/invoice-templates', data);
  return response.data.template;
};

/**
 * Updates an existing invoice text template.
 * 
 * @param {string} id - The UUID of the template to update
 * @param {Partial<InvoiceTextTemplatePayload>} data - The partial template data to update
 * @returns {Promise<InvoiceTextTemplate>} The updated template
 */
export const updateInvoiceTextTemplate = async (
  id: string,
  data: Partial<InvoiceTextTemplatePayload>
): Promise<InvoiceTextTemplate> => {
  const response = await apiClient.put(`/admin/invoice-templates/${id}`, data);
  return response.data.template;
};

/**
 * Deletes an invoice text template.
 * 
 * @param {string} id - The UUID of the template to delete
 * @returns {Promise<void>}
 */
export const deleteInvoiceTextTemplate = async (id: string): Promise<void> => {
  await apiClient.delete(`/admin/invoice-templates/${id}`);
};
