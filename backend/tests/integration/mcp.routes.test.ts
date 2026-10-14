/**
 * OpenTyme's MCP server (POST /api/mcp) over real HTTP JSON-RPC: tokens see
 * only the tools they allow, calls run through the assistant's executor with
 * the token itself. The executor's HTTP call and the Keycloak owner lookup are
 * stubbed; auth, routing and the tool layer are real.
 */

process.env.NODE_ENV = 'test';
process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ??= 'test-secret';

const execHooks = globalThis as unknown as {
  __mcpExec: (name: string, args: Record<string, unknown>, bearer: string) => Promise<{ status: number; data?: unknown }>;
};

// The Keycloak admin client is ESM-only, which Jest can't load; the owner lookup is stubbed below.
jest.mock('@keycloak/keycloak-admin-client', () => ({
  __esModule: true,
  default: class {
    users = { findOne: jest.fn() };
    realms = { findOne: jest.fn() };
    auth = jest.fn();
  },
}));
jest.mock('../../src/middleware/auth/keycloak.middleware', () => {
  const actual = jest.requireActual('../../src/middleware/auth/keycloak.middleware');
  return {
    ...actual,
    authenticateKeycloak: (req: any, res: any, next: any) => {
      const session = /^Bearer session:(.+)$/.exec(req.headers.authorization ?? '');
      if (!session) return actual.authenticateKeycloak(req, res, next);
      req.kauth = { grant: { access_token: { content: { sub: session[1], preferred_username: 'olga' } } } };
      req.authContext = { method: 'session' };
      next();
    },
  };
});
jest.mock('../../src/services/ai/tool-executor.service', () => ({
  ...jest.requireActual('../../src/services/ai/tool-executor.service'),
  executeToolCall: (name: string, args: Record<string, unknown>, bearer: string) => execHooks.__mcpExec(name, args, bearer),
}));

import express from 'express';
import request from 'supertest';
import dotenv from 'dotenv';
import path from 'path';

const envPath = process.env.DOCKER_ENV
  ? path.resolve(__dirname, '../../.env.test.docker')
  : path.resolve(__dirname, '../../.env.test');
dotenv.config({ path: envPath });

import setupRoutes from '../../src/routes';
import { getDbClient } from '../../src/utils/database';
import { keycloakService } from '../../src/services/keycloak.service';
import { registerCoreAiTools } from '../../src/services/ai/core-tools';
import { getToolsWithMeta } from '../../src/services/ai/openapi-tool-builder.service';
import { MCP_TOOL_NAMES } from '../../src/services/mcp/mcp-server.service';

const OWNER = '123e4567-e89b-12d3-a456-426614174000';

registerCoreAiTools();
const app = express();
app.use(express.json());
setupRoutes(app);

let tokenCount = 0;
async function token(permissions: Record<string, unknown>) {
  const res = await request(app)
    .post('/api/api-tokens')
    .set('Authorization', `Bearer session:${OWNER}`)
    .send({ name: `MCP client ${++tokenCount}`, permissions, expires_at: null });
  expect(res.status).toBe(201);
  return res.body.secret as string;
}

let rpcId = 0;
const mcp = (secret: string, method: string, params: Record<string, unknown> = {}) =>
  request(app)
    .post('/api/mcp')
    .set('Authorization', `Bearer ${secret}`)
    .set('Accept', 'application/json, text/event-stream')
    .set('MCP-Protocol-Version', '2025-06-18')
    .send({ jsonrpc: '2.0', id: ++rpcId, method, params });

// Everything sits in one describe so its afterAll (the cleanup) runs before
// the global afterAll in tests/setup.ts closes the database pool.
describe('MCP server', () => {
  let calls: Array<{ name: string; args: Record<string, unknown>; bearer: string }>;
  let timeTracker: string;

  beforeAll(async () => {
    await getDbClient().query('DELETE FROM api_tokens WHERE user_id = $1', [OWNER]);
    jest.spyOn(keycloakService, 'findUserById').mockResolvedValue({ id: OWNER, enabled: true, username: 'olga' });
    timeTracker = await token({
      resources: { clients: 'read', projects: 'read', time_entries: 'delete' },
      capabilities: ['mcp'],
    });
  });

  afterAll(async () => {
    await getDbClient().query('DELETE FROM api_tokens WHERE user_id = $1', [OWNER]);
  });

  beforeEach(() => {
    calls = [];
    execHooks.__mcpExec = async (name, args, bearer) => {
      calls.push({ name, args, bearer });
      if (name === 'get_time_entries_by_id') return { status: 404, data: { message: 'Time entry not found' } };
      return { status: 200, data: [{ id: 'c1', name: 'Acme' }] };
    };
  });

  it('exposes only tools that exist', () => {
    const names = new Set(getToolsWithMeta().map((t) => t.tool.function.name));
    expect(MCP_TOOL_NAMES.filter((n) => !names.has(n))).toEqual([]);
  });

  it('initializes with OpenTyme server info and instructions', async () => {
    const res = await mcp(timeTracker, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    });
    expect(res.status).toBe(200);
    expect(res.body.result.serverInfo).toMatchObject({ name: 'opentyme' });
    expect(res.body.result.capabilities.tools).toBeDefined();
    expect(res.body.result.instructions).toContain('log_time_entry');
  });

  it("lists exactly the curated tools the token's permissions allow, with hints", async () => {
    const res = await mcp(timeTracker, 'tools/list');
    const tools = res.body.result.tools as Array<{ name: string; annotations: Record<string, boolean>; inputSchema: any }>;
    const names = tools.map((t) => t.name);

    expect(names).toEqual(
      expect.arrayContaining(['get_clients', 'get_projects', 'get_time_entries', 'log_time_entry', 'delete_time_entries_by_id'])
    );
    // Not granted: invoices, reports, writing clients/projects.
    for (const hidden of ['get_invoices', 'get_time_summary', 'post_clients', 'post_projects']) {
      expect(names).not.toContain(hidden);
    }
    expect(names.every((n) => (MCP_TOOL_NAMES as readonly string[]).includes(n))).toBe(true);

    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName.get_clients.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(byName.delete_time_entries_by_id.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(byName.log_time_entry.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(byName.log_time_entry.inputSchema.type).toBe('object');
  });

  it('runs a call with the token itself, so the API checks it again', async () => {
    const res = await mcp(timeTracker, 'tools/call', { name: 'get_clients', arguments: {} });
    expect(res.body.result.isError).toBeFalsy();
    expect(JSON.parse(res.body.result.content[0].text)).toEqual([{ id: 'c1', name: 'Acme' }]);
    expect(calls).toEqual([{ name: 'get_clients', args: {}, bearer: `Bearer ${timeTracker}` }]);
  });

  it('refuses tools the token does not allow, without calling anything', async () => {
    const res = await mcp(timeTracker, 'tools/call', { name: 'get_invoices', arguments: {} });
    expect(res.body.result.isError).toBe(true);
    expect(res.body.result.content[0].text).toContain('invoices:read');
    expect(calls).toHaveLength(0);
  });

  it('reports invalid arguments, failed calls and unknown tools', async () => {
    const invalid = await mcp(timeTracker, 'tools/call', { name: 'get_time_entries_by_id', arguments: { id: '../../system' } });
    expect(invalid.body.result.isError).toBe(true);
    expect(calls).toHaveLength(0);

    const missing = await mcp(timeTracker, 'tools/call', {
      name: 'get_time_entries_by_id',
      arguments: { id: '123e4567-e89b-42d3-a456-426614174000' },
    });
    expect(missing.body.result).toMatchObject({ isError: true });
    expect(missing.body.result.content[0].text).toContain('404');

    const unknown = await mcp(timeTracker, 'tools/call', { name: 'post_admin_tax_rates', arguments: {} });
    expect(unknown.body.error.code).toBe(-32602);
  });

  it('needs the mcp capability', async () => {
    const noMcp = await token({ resources: { clients: 'read' } });
    const res = await mcp(noMcp, 'tools/list');
    expect(res.status).toBe(403);
    expect(res.body.required).toBe('capability:mcp');
  });

  it('is stateless: GET and DELETE answer 405', async () => {
    for (const method of ['get', 'delete'] as const) {
      const res = await request(app)[method]('/api/mcp').set('Authorization', `Bearer ${timeTracker}`);
      expect(res.status).toBe(405);
      expect(res.headers.allow).toBe('POST');
    }
  });
});
