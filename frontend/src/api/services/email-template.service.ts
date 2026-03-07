/**
 * Email Template API Service
 * CRUD operations for MJML email templates.
 */

import apiClient from './client';

export interface EmailTemplate {
  id: string;
  user_id: string;
  name: string;
  subject: string;
  category: string;
  mjml_content: string;
  html_content: string | null;
  variables: string[];
  is_default: boolean;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface CreateEmailTemplateDTO {
  name: string;
  subject: string;
  category?: string;
  mjml_content: string;
  is_default?: boolean;
  language?: string;
}

export type UpdateEmailTemplateDTO = Partial<CreateEmailTemplateDTO>;

export const listEmailTemplates = async (): Promise<EmailTemplate[]> => {
  const res = await apiClient.get<{ templates: EmailTemplate[] }>('/email-templates');
  return res.data.templates;
};

export const getEmailTemplate = async (id: string): Promise<EmailTemplate> => {
  const res = await apiClient.get<{ template: EmailTemplate }>(`/email-templates/${id}`);
  return res.data.template;
};

export const createEmailTemplate = async (data: CreateEmailTemplateDTO): Promise<EmailTemplate> => {
  const res = await apiClient.post<{ template: EmailTemplate }>('/email-templates', data);
  return res.data.template;
};

export const updateEmailTemplate = async (id: string, data: UpdateEmailTemplateDTO): Promise<EmailTemplate> => {
  const res = await apiClient.put<{ template: EmailTemplate }>(`/email-templates/${id}`, data);
  return res.data.template;
};

export const deleteEmailTemplate = async (id: string): Promise<void> => {
  await apiClient.delete(`/email-templates/${id}`);
};

export const previewEmailTemplate = async (
  id: string,
  variables: Record<string, string> = {}
): Promise<{ html: string; errors: Array<{ message: string }> }> => {
  const res = await apiClient.post(`/email-templates/${id}/preview`, { variables });
  return res.data;
};

export const previewRawMjml = async (
  mjml: string,
  variables: Record<string, string> = {}
): Promise<{ html: string; errors: Array<{ message: string }> }> => {
  const res = await apiClient.post('/email-templates/preview', { mjml, variables });
  return res.data;
};
