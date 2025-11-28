// Temporary simple logger to avoid winston ESM issues
// TODO: Replace with proper winston logger once dependency issues are resolved

/**
 * Simple logger class for application-wide logging.
 * Provides methods for different log levels (info, error, warn, debug, http).
 * 
 * @class SimpleLogger
 * @example
 * import { logger } from './utils/logger';
 * logger.info('Server started', { port: 8000 });
 * logger.error('Database connection failed', { error: err.message });
 */
class SimpleLogger {
  /**
   * Formats a log message with timestamp and level.
   * 
   * @private
   * @param {string} level - The log level (info, error, warn, debug, http)
   * @param {string} message - The log message
   * @param {any} [meta] - Optional metadata to include in the log
   * @returns {string} Formatted log message
   */
  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level.toUpperCase()}]: ${message}${metaStr}`;
  }

  /**
   * Logs an informational message.
   * 
   * @param {string} message - The message to log
   * @param {any} [meta] - Optional metadata
   * 
   * @example
   * logger.info('User logged in', { userId: '123', email: 'user@example.com' });
   */
  info(message: string, meta?: any): void {
    console.log(this.formatMessage('info', message, meta));
  }

  /**
   * Logs an error message.
   * 
   * @param {string} message - The error message
   * @param {any} [meta] - Optional error metadata
   * 
   * @example
   * logger.error('Failed to save data', { error: err.message, stack: err.stack });
   */
  error(message: string, meta?: any): void {
    console.error(this.formatMessage('error', message, meta));
  }

  /**
   * Logs a warning message.
   * 
   * @param {string} message - The warning message
   * @param {any} [meta] - Optional metadata
   * 
   * @example
   * logger.warn('Deprecated API endpoint used', { endpoint: '/api/old' });
   */
  warn(message: string, meta?: any): void {
    console.warn(this.formatMessage('warn', message, meta));
  }

  /**
   * Logs a debug message (only in non-production environments).
   * 
   * @param {string} message - The debug message
   * @param {any} [meta] - Optional metadata
   * 
   * @example
   * logger.debug('Processing request', { body: req.body });
   */
  debug(message: string, meta?: any): void {
    if (process.env.NODE_ENV !== 'production') {
      console.log(this.formatMessage('debug', message, meta));
    }
  }

  /**
   * Logs an HTTP request message (only in non-production environments).
   * 
   * @param {string} message - The HTTP message
   * @param {any} [meta] - Optional metadata (method, path, status, etc.)
   * 
   * @example
   * logger.http('Incoming request', { method: 'GET', path: '/api/clients', status: 200 });
   */
  http(message: string, meta?: any): void {
    if (process.env.NODE_ENV !== 'production') {
      console.log(this.formatMessage('http', message, meta));
    }
  }
}

/**
 * Global logger instance for the application.
 * Use this throughout the codebase for consistent logging.
 * 
 * @constant {SimpleLogger}
 */
export const logger = new SimpleLogger();
