/**
 * @fileoverview Provider-optional error reporting / observability.
 *
 * Activates Sentry only when BOTH `SENTRY_DSN` is set AND `@sentry/node` is
 * installed (guarded require with a variable specifier so the optional dependency
 * is never resolved at build time). With neither, every capture point still logs
 * via the app logger — so wiring is useful immediately and Sentry is a drop-in.
 *
 * To enable Sentry: `npm i @sentry/node` in backend/, then set SENTRY_DSN.
 *
 * @module utils/observability
 */

import { logger } from './logger';

/* eslint-disable @typescript-eslint/no-explicit-any */
let sentry: any = null;

/** Initializes Sentry if configured + installed. Safe to call once at startup. */
export function initObservability(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info('[Observability] SENTRY_DSN not set — error tracking disabled (logging only)');
    return;
  }
  try {
    // Variable specifier keeps tsc/bundlers from resolving the optional dep at build time.
    const moduleName = '@sentry/node';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    sentry = require(moduleName);
    sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0'),
    });
    logger.info('[Observability] Sentry error tracking initialized');
  } catch (err) {
    sentry = null;
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[Observability] SENTRY_DSN is set but @sentry/node is not installed — run "npm i @sentry/node" (${msg})`);
  }
}

/** Reports an error to Sentry (if active); never throws. */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  try {
    if (sentry) sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    /* reporting must never throw */
  }
}

/**
 * Installs process-level handlers so crashes/rejections are logged and reported
 * rather than vanishing silently (a gap that let earlier failures go unnoticed).
 */
export function installProcessHandlers(): void {
  process.on('unhandledRejection', (reason) => {
    logger.error('[Process] Unhandled promise rejection', { reason });
    captureException(reason);
  });
  process.on('uncaughtException', (err) => {
    logger.error('[Process] Uncaught exception', { error: err });
    captureException(err);
    // Intentionally do not exit here — the container healthcheck/process manager
    // governs restarts; exiting on every uncaught error can mask issues.
  });
}
