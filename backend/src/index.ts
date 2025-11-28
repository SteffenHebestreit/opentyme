import { app } from './app';
import { testConnection, getDbClient } from './utils/database';
import { logger } from './utils/logger';
import { runStartupInitialization, shouldRunStartupInitialization } from './utils/startup';
import BackupScheduler from './services/system/backup-scheduler.service';
import recurringExpenseScheduler from './services/financial/recurring-expense-scheduler.service';
import { mcpClient } from './services/mcp/mcp-client.service';

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

    // Initialize MCP client connections (DuckDuckGo, etc.)
    try {
      await mcpClient.initializeConnections();
      logger.info('✅ MCP client initialized successfully');
    } catch (err: any) {
      logger.warn('⚠ MCP client initialization failed:', err);
      logger.warn('AI web search features may not work correctly');
    }

    // Start the server
    app.listen(port, () => {
      logger.info(`⚡️ [server]: Server is running at http://localhost:${port}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err: any) {
    logger.error('Failed to start server:', { error: err.message });
    process.exit(1);
  }
}

// Start the application
startServer();
