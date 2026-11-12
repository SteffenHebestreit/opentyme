/**
 * The credential a workflow run calls the API with: only this process can
 * mint it, it expires, it is believed on loopback only, and it reaches
 * exactly what the flow was published with — never settings, system
 * administration, token management or the workflow API itself.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const resolveOwner = jest.fn();
jest.mock('../../src/services/auth/api-token.service', () => ({
  apiTokenService: { resolveOwner: (...args: unknown[]) => resolveOwner(...args) },
}));

import {
  isWorkflowCredential,
  mintWorkflowCredential,
  verifyWorkflowCredential,
} from '../../src/services/workflow/workflow-credential';
import { authenticateWorkflowCredential } from '../../src/middleware/auth/workflow-credential.middleware';
import type { ApiTokenPermissions } from '../../src/services/auth/api-token-permissions';

const permissions: ApiTokenPermissions = { resources: { invoices: 'write', reports: 'read' }, capabilities: ['email_send'] };
const claims = { userId: 'user-1', runId: 'run-1', permissions };

describe('credential', () => {
  it('round-trips what was minted', () => {
    const token = mintWorkflowCredential(claims);
    expect(isWorkflowCredential(token)).toBe(true);
    expect(verifyWorkflowCredential(token)).toMatchObject(claims);
  });

  it('rejects a changed payload, a changed signature and anything malformed', () => {
    const token = mintWorkflowCredential(claims);
    const [payload, signature] = token.slice('oty_wf_'.length).split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...claims, permissions: { resources: { invoices: 'delete' }, capabilities: [] }, exp: Date.now() + 60_000 })
    ).toString('base64url');
    expect(verifyWorkflowCredential(`oty_wf_${forged}.${signature}`)).toBeNull();
    expect(verifyWorkflowCredential(`oty_wf_${payload}.${signature.slice(0, -2)}AA`)).toBeNull();
    expect(verifyWorkflowCredential(`oty_wf_${payload}`)).toBeNull();
    expect(verifyWorkflowCredential(`oty_wf_${payload}.${signature}.extra`)).toBeNull();
    expect(verifyWorkflowCredential('oty_pat_something')).toBeNull();
  });

  it('expires', () => {
    expect(verifyWorkflowCredential(mintWorkflowCredential(claims, -1))).toBeNull();
  });
});

class FakeRes {
  statusCode = 200;
  body: any;
  headers: Record<string, string> = {};
  locals: Record<string, unknown> = {};
  set(key: string, value: string) {
    this.headers[key.toLowerCase()] = value;
    return this;
  }
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  json(body: unknown) {
    this.body = body;
    return this;
  }
}

async function call(method: string, path: string, options: { ip?: string; token?: string } = {}) {
  const req: any = { method, baseUrl: path, path: '', socket: { remoteAddress: options.ip ?? '127.0.0.1' }, get: () => undefined };
  const res = new FakeRes();
  const next = jest.fn();
  await authenticateWorkflowCredential(req, res as any, next, options.token ?? mintWorkflowCredential(claims));
  return { req, res, next };
}

describe('authenticateWorkflowCredential', () => {
  beforeEach(() => {
    resolveOwner.mockReset();
    resolveOwner.mockResolvedValue({ id: 'user-1', email: 'me@example.com', username: 'me', emailVerified: true });
  });

  it('lets a run act as its owner, within the flow permissions', async () => {
    const { req, res, next } = await call('POST', '/api/invoices/generate-from-time-entries');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(req.authContext).toEqual({ method: 'workflow', runId: 'run-1', permissions });
    expect(req.kauth.grant.access_token.content).toMatchObject({ sub: 'user-1', realm_access: { roles: [] } });
  });

  it('is believed on loopback only', async () => {
    const { res, next } = await call('GET', '/api/invoices', { ip: '10.14.0.55' });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(resolveOwner).not.toHaveBeenCalled();
  });

  it('refuses what the flow was not published with', async () => {
    const denied = await call('DELETE', '/api/invoices/123');
    expect(denied.next).not.toHaveBeenCalled();
    expect(denied.res.statusCode).toBe(403);
    expect(denied.res.body.required).toBe('invoices:delete');

    const noClients = await call('GET', '/api/clients');
    expect(noClients.res.statusCode).toBe(403);
  });

  it.each([
    ['PUT', '/api/settings'],
    ['GET', '/api/system/backups'],
    ['POST', '/api/api-tokens'],
    ['POST', '/api/workflows/definitions'],
    ['POST', '/api/workflows/tasks/abc/approve'],
    ['POST', '/api/ai/run'],
  ])('never reaches %s %s', async (method, path) => {
    const { res, next } = await call(method, path);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('stops when the owner is gone', async () => {
    resolveOwner.mockResolvedValue(null);
    const { res, next } = await call('GET', '/api/invoices');
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects an expired or foreign credential', async () => {
    const expired = await call('GET', '/api/invoices', { token: mintWorkflowCredential(claims, -1) });
    expect(expired.res.statusCode).toBe(401);
    const foreign = await call('GET', '/api/invoices', { token: 'oty_wf_abc.def' });
    expect(foreign.res.statusCode).toBe(401);
  });
});
