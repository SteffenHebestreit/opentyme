import { Application } from 'express';

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

// Analytics routes
import analyticsRoutes from './analytics/analytics.routes';
import reportRoutes from './analytics/report.routes';

export default function setupRoutes(app: Application) {
  // Auth endpoints
  app.use('/api/auth', authRoutes);
  console.log('Auth routes registered under /api/auth');
  
  app.use('/api/password-reset', passwordResetRoutes);
  console.log('Password reset routes registered under /api/password-reset');

  // Business endpoints
  app.use('/api/clients', clientRoutes);
  console.log('Client routes registered under /api/clients');
  
  app.use('/api/projects', projectRoutes);
  console.log('Project routes registered under /api/projects');
  
  app.use('/api/time-entries', timeEntryRoutes);
  console.log('Time entry routes registered under /api/time-entries');

  app.use('/api/expenses', expenseRoutes);
  console.log('Expense routes registered under /api/expenses');

  // Financial endpoints
  app.use('/api/invoices', invoiceRoutes);
  console.log('Invoice routes registered under /api/invoices');
  
  app.use('/api/payments', paymentRoutes);
  console.log('Payment routes registered under /api/payments');

  app.use('/api/tax-prepayments', taxPrepaymentRoutes);
  console.log('Tax prepayment routes registered under /api/tax-prepayments');

  app.use('/api/depreciation', depreciationRoutes);
  console.log('Depreciation routes registered under /api/depreciation');

  // Admin endpoints
  app.use('/api/admin/tax-rates', taxRateRoutes);
  console.log('Tax rate routes registered under /api/admin/tax-rates');
  
  app.use('/api/admin/invoice-templates', invoiceTextTemplateRoutes);
  console.log('Invoice text template routes registered under /api/admin/invoice-templates');

  // System endpoints
  app.use('/api/system/backups', backupRoutes);
  console.log('Backup/Restore routes registered under /api/system/backups');

  app.use('/api/system', initializationRoutes);
  console.log('System initialization routes registered under /api/system');

  app.use('/api/settings', settingsRoutes);
  console.log('Settings routes registered under /api/settings');

  // Analytics endpoints
  app.use('/api/analytics', analyticsRoutes);
  console.log('Analytics routes registered under /api/analytics');

  // Report endpoints
  app.use('/api/reports', reportRoutes);
  console.log('Report routes registered under /api/reports');
}
