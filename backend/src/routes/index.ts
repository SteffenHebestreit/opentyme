import { Application } from 'express';
import { logger } from '../utils/logger';

// Auth routes
import authRoutes from './auth/auth.routes';
import passwordResetRoutes from './auth/password-reset.routes';

// Business routes
import clientRoutes from './business/client.routes';
import projectRoutes from './business/project.routes';
import timeEntryRoutes from './business/time-entry.routes';
import expenseRoutes from './business/expense.routes';

// Financial routes
import invoiceRoutes from './financial/invoice.routes';
import paymentRoutes from './financial/payment.routes';
import taxRateRoutes from './financial/tax-rate.routes';
import invoiceTextTemplateRoutes from './financial/invoice-text-template.routes';
import taxPrepaymentRoutes from './financial/tax-prepayment.routes';
import depreciationRoutes from './financial/depreciation.routes';

// System routes
import backupRoutes from './system/backup.routes';
import initializationRoutes from './system/initialization.routes';
import settingsRoutes from './system/settings.routes';
import pluginsRoutes from './system/plugins.routes';

// Communication routes
import emailTemplateRoutes from './communication/email-template.routes';
import emailSendRoutes from './communication/email-send.routes';

// AI routes
import aiRoutes from './ai/ai-assistant.routes';
import aiInsightsRoutes from './ai/ai-insights.routes';
import { getAgentCard } from '../controllers/ai/ai-assistant.controller';

// Analytics routes
import analyticsRoutes from './analytics/analytics.routes';
import reportRoutes from './analytics/report.routes';
import taxPackageRoutes from './analytics/tax-package.routes';

export default function setupRoutes(app: Application) {
  // Auth endpoints
  app.use('/api/auth', authRoutes);
  logger.debug('Auth routes registered under /api/auth');

  app.use('/api/password-reset', passwordResetRoutes);
  logger.debug('Password reset routes registered under /api/password-reset');

  // Business endpoints
  app.use('/api/clients', clientRoutes);
  logger.debug('Client routes registered under /api/clients');

  app.use('/api/projects', projectRoutes);
  logger.debug('Project routes registered under /api/projects');

  app.use('/api/time-entries', timeEntryRoutes);
  logger.debug('Time entry routes registered under /api/time-entries');

  app.use('/api/expenses', expenseRoutes);
  logger.debug('Expense routes registered under /api/expenses');

  // Financial endpoints
  app.use('/api/invoices', invoiceRoutes);
  logger.debug('Invoice routes registered under /api/invoices');

  app.use('/api/payments', paymentRoutes);
  logger.debug('Payment routes registered under /api/payments');

  app.use('/api/tax-prepayments', taxPrepaymentRoutes);
  logger.debug('Tax prepayment routes registered under /api/tax-prepayments');

  app.use('/api/depreciation', depreciationRoutes);
  logger.debug('Depreciation routes registered under /api/depreciation');

  // Admin endpoints
  app.use('/api/admin/tax-rates', taxRateRoutes);
  logger.debug('Tax rate routes registered under /api/admin/tax-rates');

  app.use('/api/admin/invoice-templates', invoiceTextTemplateRoutes);
  logger.debug('Invoice text template routes registered under /api/admin/invoice-templates');

  // System endpoints
  app.use('/api/system/backups', backupRoutes);
  logger.debug('Backup/Restore routes registered under /api/system/backups');

  app.use('/api/system', initializationRoutes);
  logger.debug('System initialization routes registered under /api/system');

  app.use('/api/settings', settingsRoutes);
  logger.debug('Settings routes registered under /api/settings');

  // Plugin management endpoints
  app.use('/api/plugins', pluginsRoutes);
  logger.debug('Plugin routes registered under /api/plugins');

  // Communication endpoints
  app.use('/api/email-templates', emailTemplateRoutes);
  logger.debug('Email template routes registered under /api/email-templates');

  app.use('/api/email', emailSendRoutes);
  logger.debug('Email send routes registered under /api/email');

  // Analytics endpoints
  app.use('/api/analytics', analyticsRoutes);
  logger.debug('Analytics routes registered under /api/analytics');

  // Report endpoints
  app.use('/api/reports', reportRoutes);
  logger.debug('Report routes registered under /api/reports');

  // Tax package endpoints
  app.use('/api/tax-package', taxPackageRoutes);
  logger.debug('Tax package routes registered under /api/tax-package');

  // AI assistant endpoints (AG-UI + A2A)
  app.use('/api/ai', aiRoutes);
  logger.debug('AI assistant routes registered under /api/ai');

  // AI insights (pre-aggregated query endpoints for LLM tool use)
  app.use('/api/insights', aiInsightsRoutes);
  logger.debug('AI insights routes registered under /api/insights');

  // A2A Agent Card at well-known path
  app.get('/.well-known/agent.json', getAgentCard);
  logger.debug('A2A Agent Card registered at /.well-known/agent.json');

  logger.info('All routes registered successfully');
}
