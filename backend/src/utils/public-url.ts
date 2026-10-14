import { Request } from 'express';

/**
 * The public origin of this installation (no trailing slash): PUBLIC_URL,
 * or what the request says when it isn't set. Used where URLs are handed to
 * other systems — OAuth metadata, the A2A agent card.
 */
export function publicBaseUrl(req: Request): string {
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}
