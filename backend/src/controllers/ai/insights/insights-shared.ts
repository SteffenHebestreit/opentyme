/**
 * Shared helpers for the AI insights controllers.
 * All insights endpoints are authenticated; req.user is guaranteed by middleware.
 */

import { Request, Response } from 'express';
import { logger } from '../../../utils/logger';

export function userId(req: Request): string {
  return req.user!.id;
}

/**
 * Uniform 500 handler for insights endpoints. Logs the real error but returns
 * a generic message — raw driver/SQL error text must not flow back to the
 * model (or any client) as a tool result.
 */
export function handleInsightsError(res: Response, label: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error(`[Insights] ${label}: ${msg}`);
  res.status(500).json({ error: `${label} failed — internal error. Try again or use a different tool.` });
}
