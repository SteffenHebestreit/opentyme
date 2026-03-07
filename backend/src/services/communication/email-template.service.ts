/**
 * @fileoverview Email Template Service
 * Manages MJML email templates with placeholder support.
 */

import mjml2html from 'mjml';
import { getDbClient } from '../../utils/database';
import { logger } from '../../utils/logger';

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

/**
 * Extracts all {{variable}} placeholder names from MJML content.
 */
function extractVariables(content: string): string[] {
  const regex = /\{\{([\w.]+)\}\}/g;
  const variables = new Set<string>();
  let match;
  while ((match = regex.exec(content)) !== null) {
    variables.add(match[1]);
  }
  return Array.from(variables);
}

/**
 * Compiles MJML to HTML. Returns empty string on error.
 */
export function renderMjml(mjmlContent: string): { html: string; errors: Array<{ message: string }> } {
  try {
    const result = mjml2html(mjmlContent, { validationLevel: 'soft' });
    return {
      html: result.html,
      errors: (result.errors ?? []).map((e: any) => ({ message: e.formattedMessage ?? String(e) })),
    };
  } catch (error) {
    logger.error('MJML rendering failed', { error });
    return { html: '', errors: [{ message: String(error) }] };
  }
}

export async function listEmailTemplates(userId: string): Promise<EmailTemplate[]> {
  const pool = getDbClient();
  const result = await pool.query(
    'SELECT * FROM email_templates WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
}

export async function getEmailTemplate(id: string, userId: string): Promise<EmailTemplate | null> {
  const pool = getDbClient();
  const result = await pool.query(
    'SELECT * FROM email_templates WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return result.rows[0] ?? null;
}

export async function createEmailTemplate(
  userId: string,
  data: CreateEmailTemplateDTO
): Promise<EmailTemplate> {
  const pool = getDbClient();
  const { html, errors } = renderMjml(data.mjml_content);
  if (errors.length > 0) {
    logger.warn('MJML rendering warnings on template create', { errors });
  }
  const variables = extractVariables(data.mjml_content);

  const result = await pool.query(
    `INSERT INTO email_templates
       (user_id, name, subject, category, mjml_content, html_content, variables, is_default, language)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      userId,
      data.name,
      data.subject,
      data.category ?? 'custom',
      data.mjml_content,
      html || null,
      JSON.stringify(variables),
      data.is_default ?? false,
      data.language ?? 'de',
    ]
  );
  return result.rows[0];
}

export async function updateEmailTemplate(
  id: string,
  userId: string,
  data: UpdateEmailTemplateDTO
): Promise<EmailTemplate | null> {
  const pool = getDbClient();
  const existing = await getEmailTemplate(id, userId);
  if (!existing) return null;

  const mjmlContent = data.mjml_content ?? existing.mjml_content;
  const { html, errors } = renderMjml(mjmlContent);
  if (errors.length > 0) {
    logger.warn('MJML rendering warnings on template update', { errors });
  }
  const variables = extractVariables(mjmlContent);

  const result = await pool.query(
    `UPDATE email_templates
     SET name = $3, subject = $4, category = $5, mjml_content = $6, html_content = $7,
         variables = $8, is_default = $9, language = $10, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [
      id,
      userId,
      data.name ?? existing.name,
      data.subject ?? existing.subject,
      data.category ?? existing.category,
      mjmlContent,
      html || null,
      JSON.stringify(variables),
      data.is_default ?? existing.is_default,
      data.language ?? existing.language,
    ]
  );
  return result.rows[0] ?? null;
}

export async function deleteEmailTemplate(id: string, userId: string): Promise<boolean> {
  const pool = getDbClient();
  const result = await pool.query(
    'DELETE FROM email_templates WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Renders a template with sample/preview variables substituted.
 */
export async function previewEmailTemplate(
  id: string,
  userId: string,
  variables: Record<string, string> = {}
): Promise<{ html: string; errors: Array<{ message: string }> } | null> {
  const template = await getEmailTemplate(id, userId);
  if (!template) return null;

  const { html, errors } = renderMjml(template.mjml_content);
  let renderedHtml = html;
  for (const [key, value] of Object.entries(variables)) {
    renderedHtml = renderedHtml.replace(new RegExp(`\\{\\{${key.replace('.', '\\.')}\\}\\}`, 'g'), value);
  }
  return { html: renderedHtml, errors };
}

/**
 * Compiles a template and substitutes real variable values for sending.
 */
export async function renderTemplateForSend(
  id: string,
  userId: string,
  variables: Record<string, string>
): Promise<{ subject: string; html: string } | null> {
  const template = await getEmailTemplate(id, userId);
  if (!template) return null;

  const { html } = renderMjml(template.mjml_content);
  let renderedHtml = html;
  let renderedSubject = template.subject;

  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key.replace('.', '\\.')}\\}\\}`, 'g');
    renderedHtml = renderedHtml.replace(pattern, value);
    renderedSubject = renderedSubject.replace(pattern, value);
  }
  return { subject: renderedSubject, html: renderedHtml };
}
