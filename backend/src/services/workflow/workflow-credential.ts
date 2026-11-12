/**
 * @fileoverview The credential a workflow run calls the API with.
 *
 * A run continues days after the user's session ended (a due date passes, a
 * scheduled start fires), so its actions cannot borrow the user's token the
 * way the assistant's tools do. Instead the engine mints a short-lived
 * credential per call: the owner's id, the run, and exactly the permissions
 * the flow was published with.
 *
 * It is signed with a key that exists only in this process — the engine and
 * the API are the same process — and is accepted on loopback only (see
 * middleware/auth/workflow-credential.middleware.ts). Nothing is stored, and
 * a restart invalidates every credential that was in flight.
 *
 * Kept free of other service imports so the auth middleware can load it
 * without pulling in the engine.
 *
 * @module services/workflow/workflow-credential
 */

import crypto from 'crypto';
import type { ApiTokenPermissions } from '../auth/api-token-permissions';

const PREFIX = 'oty_wf_';
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const signingKey = crypto.randomBytes(32);

export interface WorkflowCredentialClaims {
  userId: string;
  runId: string;
  permissions: ApiTokenPermissions;
  /** Expiry, epoch milliseconds */
  exp: number;
}

function sign(payload: string): Buffer {
  return crypto.createHmac('sha256', signingKey).update(payload).digest();
}

export function isWorkflowCredential(token: string): boolean {
  return token.startsWith(PREFIX);
}

export function mintWorkflowCredential(
  claims: Omit<WorkflowCredentialClaims, 'exp'>,
  ttlMs: number = DEFAULT_TTL_MS
): string {
  const payload = Buffer.from(JSON.stringify({ ...claims, exp: Date.now() + ttlMs })).toString('base64url');
  return `${PREFIX}${payload}.${sign(payload).toString('base64url')}`;
}

/** The claims of a credential this process issued and that has not expired, else null. */
export function verifyWorkflowCredential(token: string): WorkflowCredentialClaims | null {
  if (!isWorkflowCredential(token)) return null;
  const [payload, signature, ...rest] = token.slice(PREFIX.length).split('.');
  if (!payload || !signature || rest.length > 0) return null;

  const expected = sign(payload);
  let given: Buffer;
  try {
    given = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as WorkflowCredentialClaims;
    if (typeof claims.userId !== 'string' || typeof claims.runId !== 'string') return null;
    if (typeof claims.exp !== 'number' || claims.exp < Date.now()) return null;
    if (!claims.permissions || typeof claims.permissions !== 'object') return null;
    return claims;
  } catch {
    return null;
  }
}
