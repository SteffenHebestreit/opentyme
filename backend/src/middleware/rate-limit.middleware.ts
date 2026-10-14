/**
 * @fileoverview Rate limiting middleware for sensitive endpoints.
 *
 * Protects authentication and password-reset endpoints from brute-force and
 * credential-stuffing attacks, and shields the Keycloak token introspection
 * path from being flooded with unique tokens.
 *
 * Limits are configurable via environment variables so they can be tuned per
 * deployment without code changes. All limiters fail open only on configuration
 * errors — under normal operation an over-limit client receives HTTP 429.
 *
 * @module middleware/rate-limit.middleware
 */

import rateLimit from 'express-rate-limit';
import { RequestHandler } from 'express';
import { logger } from '../utils/logger';

/**
 * Parse an integer environment variable with a fallback default.
 */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Strict limiter for authentication attempts (login / register).
 * Defaults: 20 requests per 15 minutes per IP.
 */
export const authRateLimiter = rateLimit({
  windowMs: envInt('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  max: envInt('AUTH_RATE_LIMIT_MAX', 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Too many authentication attempts. Please try again later.' },
  handler: (req, res, _next, options) => {
    logger.warn(`[RateLimit] Auth limit exceeded for IP ${req.ip} on ${req.path}`);
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Very strict limiter for password-reset requests to prevent email bombing
 * and account enumeration. Defaults: 5 requests per hour per IP.
 */
export const passwordResetRateLimiter = rateLimit({
  windowMs: envInt('PASSWORD_RESET_RATE_LIMIT_WINDOW_MS', 60 * 60 * 1000),
  max: envInt('PASSWORD_RESET_RATE_LIMIT_MAX', 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Too many password reset requests. Please try again later.' },
  handler: (req, res, _next, options) => {
    logger.warn(`[RateLimit] Password-reset limit exceeded for IP ${req.ip} on ${req.path}`);
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Global API rate limiter — OPT-IN via RATE_LIMIT_ENABLED=true.
 *
 * Disabled by default on purpose: it keys on req.ip, so it is only safe once
 * `trust proxy` is configured (TRUST_PROXY) to surface the real client IP behind
 * Traefik/Nginx — otherwise all traffic shares the proxy IP and every user is
 * throttled together. Generous defaults so normal use is never blocked; tune via
 * GLOBAL_RATE_LIMIT_WINDOW_MS / GLOBAL_RATE_LIMIT_MAX.
 *
 * In-memory store (fine for a single backend replica). For multi-replica, swap in
 * a shared store (e.g. rate-limit-redis against the existing Redis service).
 */
const globalEnabled = process.env.RATE_LIMIT_ENABLED === 'true';

export const globalRateLimiter: RequestHandler = globalEnabled
  ? rateLimit({
      windowMs: envInt('GLOBAL_RATE_LIMIT_WINDOW_MS', 60 * 1000),
      max: envInt('GLOBAL_RATE_LIMIT_MAX', 300),
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too Many Requests', message: 'Too many requests. Please slow down.' },
      skip: (req) => req.path === '/health' || req.path === '/api/health',
      handler: (req, res, _next, options) => {
        logger.warn(`[RateLimit] Global limit exceeded for IP ${req.ip} on ${req.path}`);
        res.status(options.statusCode).json(options.message);
      },
    })
  : (_req, _res, next) => next();

/**
 * Per-token limit for requests made with a personal access token — keyed by
 * the token, so it works behind the proxy without TRUST_PROXY and one busy
 * agent can't use up another's budget. Counts the assistant's and the MCP
 * server's tool calls too, so a token can't multiply its budget through them.
 * Defaults: 600 requests per minute; tune via API_TOKEN_RATE_LIMIT_WINDOW_MS /
 * API_TOKEN_RATE_LIMIT_MAX. In-memory store (one backend replica).
 */
export const apiTokenRateLimiter: RequestHandler = rateLimit({
  windowMs: envInt('API_TOKEN_RATE_LIMIT_WINDOW_MS', 60 * 1000),
  max: envInt('API_TOKEN_RATE_LIMIT_MAX', 600),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.authContext?.method === 'pat' ? `pat:${req.authContext.tokenId}` : 'none'),
  skip: (req) => req.authContext?.method !== 'pat',
  message: { error: 'Too Many Requests', message: 'This API token made too many requests. Slow down and retry shortly.' },
  handler: (req, res, _next, options) => {
    const tokenId = req.authContext?.method === 'pat' ? req.authContext.tokenId : 'unknown';
    logger.warn(`[RateLimit] API token ${tokenId} exceeded its limit on ${req.method} ${req.originalUrl.split('?')[0]}`);
    res.status(options.statusCode).json(options.message);
  },
});
