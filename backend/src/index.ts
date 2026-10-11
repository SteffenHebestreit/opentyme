import { app } from './app';
import { testConnection, getDbClient } from './utils/database';
import { logger } from './utils/logger';
import { runStartupInitialization, shouldRunStartupInitialization } from './utils/startup';
import BackupScheduler from './services/system/backup-scheduler.service';
import recurringExpenseScheduler from './services/financial/recurring-expense-scheduler.service';
import invoiceReminderScheduler from './services/financial/invoice-reminder-scheduler.service';
import recurringInvoiceScheduler from './services/financial/recurring-invoice-scheduler.service';
import projectRateScheduler from './services/business/project-rate-scheduler.service';
import { mcpClient } from './services/mcp/mcp-client.service';
import { initObservability, installProcessHandlers } from './utils/observability';
import { registerCoreAiTools } from './services/ai/core-tools';

const port = process.env.PORT || 8000;

// Initialize backup scheduler singleton
let backupScheduler: BackupScheduler | null = null;

// Initialize application
async function startServer() {
  try {
    // Test database connection
    await testConnection();
    logger.info('Database connection established successfully.');

    // Run startup initialization (create user buckets, etc.)
    // IMPORTANT: Wait for table creation before initializing scheduler
    if (shouldRunStartupInitialization()) {
      await runStartupInitialization();
    } else {
      logger.info('[Startup] Skipping startup initialization (disabled via env var)');
    }

    // Initialize backup scheduler (AFTER tables are ensured to exist)
    try {
      const pool = getDbClient();
      backupScheduler = new BackupScheduler(pool);
      await backupScheduler.initialize();
      logger.info('✅ Backup scheduler initialized successfully');
    } catch (err: any) {
      logger.error('Failed to initialize backup scheduler:', err);
    }

    // Initialize recurring expense scheduler
    try {
      recurringExpenseScheduler.initialize();
      logger.info('✅ Recurring expense scheduler initialized successfully');
    } catch (err: any) {
      logger.error('Failed to initialize recurring expense scheduler:', err);
    }

    // Initialize project rate scheduler (advances the denormalised current rate
    // when a future-dated rate period takes effect)
    try {
      projectRateScheduler.initialize();
      logger.info('✅ Project rate scheduler initialized successfully');
    } catch (err: any) {
      logger.error('Failed to initialize project rate scheduler:', err);
    }

    // Initialize invoice overdue reminder scheduler
    try {
      invoiceReminderScheduler.initialize();
      logger.info('✅ Invoice reminder scheduler initialized successfully');
    } catch (err: any) {
      logger.error('Failed to initialize invoice reminder scheduler:', err);
    }

    // Initialize recurring invoice scheduler
    try {
      recurringInvoiceScheduler.initialize();
      logger.info('✅ Recurring invoice scheduler initialized successfully');
    } catch (err: any) {
      logger.error('Failed to initialize recurring invoice scheduler:', err);
    }

    // Start the server
    app.listen(port, () => {
      logger.info(`⚡️ [server]: Server is running at ${process.env.PUBLIC_URL || `http://localhost:${port}`}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Optional MCP gateway (AI web research in the AfA analysis). Only tried
    // when MCP_GATEWAY_URL is set, and never delays the server start —
    // initializeConnections() logs its own outcome and never throws.
    void mcpClient.initializeConnections();
  } catch (err: any) {
    logger.error('Failed to start server:', { error: err.message });
    process.exit(1);
  }
}

// Initialize error tracking + process-level safety nets before starting.
initObservability();
installProcessHandlers();

// Core composite AI tools must be registered before the first AI request
// builds the (cached) tool list.
registerCoreAiTools();

// Start the application
startServer();
