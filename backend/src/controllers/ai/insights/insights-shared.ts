/**
 * Shared helpers for the AI insights controllers.
 * All insights endpoints are authenticated; req.user is guaranteed by middleware.
 */

import { Request } from 'express';

export function userId(req: Request): string {
  return req.user!.id;
}
