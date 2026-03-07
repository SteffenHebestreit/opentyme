/**
 * @fileoverview Email Template Controller
 * CRUD endpoints for user-owned MJML email templates.
 */

import { Request, Response } from 'express';
import { logger } from '../../utils/logger';
import * as emailTemplateService from '../../services/communication/email-template.service';

export const listTemplates = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const templates = await emailTemplateService.listEmailTemplates(userId);
    res.json({ templates });
  } catch (error) {
    logger.error('Failed to list email templates', { error });
    res.status(500).json({ error: 'Failed to retrieve email templates' });
  }
};

export const getTemplate = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const template = await emailTemplateService.getEmailTemplate(id, userId);
    if (!template) { res.status(404).json({ error: 'Template not found' }); return; }
    res.json({ template });
  } catch (error) {
    logger.error('Failed to get email template', { error, id });
    res.status(500).json({ error: 'Failed to retrieve email template' });
  }
};

export const createTemplate = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const template = await emailTemplateService.createEmailTemplate(userId, req.body);
    res.status(201).json({ template });
  } catch (error) {
    logger.error('Failed to create email template', { error });
    res.status(500).json({ error: 'Failed to create email template' });
  }
};

export const updateTemplate = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const template = await emailTemplateService.updateEmailTemplate(id, userId, req.body);
    if (!template) { res.status(404).json({ error: 'Template not found' }); return; }
    res.json({ template });
  } catch (error) {
    logger.error('Failed to update email template', { error, id });
    res.status(500).json({ error: 'Failed to update email template' });
  }
};

export const deleteTemplate = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const deleted = await emailTemplateService.deleteEmailTemplate(id, userId);
    if (!deleted) { res.status(404).json({ error: 'Template not found' }); return; }
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete email template', { error, id });
    res.status(500).json({ error: 'Failed to delete email template' });
  }
};

export const previewTemplate = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const result = await emailTemplateService.previewEmailTemplate(
      id,
      userId,
      req.body.variables ?? {}
    );
    if (!result) { res.status(404).json({ error: 'Template not found' }); return; }
    res.json(result);
  } catch (error) {
    logger.error('Failed to preview email template', { error, id });
    res.status(500).json({ error: 'Failed to render template preview' });
  }
};

/**
 * POST /api/email-templates/preview
 * Render raw MJML content to HTML without saving — used for live preview.
 */
export const previewRawTemplate = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const { mjml, variables = {} } = req.body;
  if (!mjml) { res.status(400).json({ error: 'mjml field is required' }); return; }
  try {
    const { html, errors } = emailTemplateService.renderMjml(mjml);
    let renderedHtml = html;
    for (const [key, value] of Object.entries(variables as Record<string, string>)) {
      renderedHtml = renderedHtml.replace(
        new RegExp(`\\{\\{${key.replace('.', '\\.')}\\}\\}`, 'g'),
        value
      );
    }
    res.json({ html: renderedHtml, errors });
  } catch (error) {
    logger.error('Failed to preview raw MJML', { error });
    res.status(500).json({ error: 'Failed to render MJML preview' });
  }
};
