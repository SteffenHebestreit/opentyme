/**
 * Safety of the OpenAPI-derived AI tools: path parameters are validated before
 * they are substituted into URLs, binary downloads are not exposed as tools,
 * tool HTTP calls are size-capped, the admin-only gate mirrors the routes' real
 * role middleware, and log_time_entry's project matching refuses ambiguity.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock('axios', () => {
  const fn: any = jest.fn(async () => ({ status: 200, data: { ok: true }, headers: { 'content-type': 'application/json' } }));
  fn.get = jest.fn();
  fn.post = jest.fn();
  fn.create = jest.fn(() => fn);
  return { __esModule: true, default: fn };
});

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import {
  buildTools,
  checkPathParam,
  getOperationByName,
  getToolsWithMeta,
  validateToolArguments,
} from '../../src/services/ai/openapi-tool-builder.service';
import { executeToolCall } from '../../src/services/ai/tool-executor.service';
import { isAdminOnlyOperation, isToolAllowedForRoles } from '../../src/services/ai/tool-selection.service';
import { matchProject } from '../../src/services/ai/core-tools';

const axiosMock = axios as unknown as jest.Mock;
const UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('checkPathParam', () => {
  it('accepts well-formed values', () => {
    expect(checkPathParam('id', UUID, { type: 'string', format: 'uuid' })).toBeNull();
    expect(checkPathParam('date', '2026-10-11', { type: 'string', format: 'date' })).toBeNull();
    expect(checkPathParam('invoice_number', 'RE-2026-001', { type: 'string' })).toBeNull();
  });

  it('rejects path-changing values', () => {
    for (const v of ['.', '..', ' .. ', 'a/b', '../admin', 'a\\b', '']) {
      expect(checkPathParam('invoice_number', v, { type: 'string' })).not.toBeNull();
    }
  });

  it('enforces format uuid / date and the integer type', () => {
    expect(checkPathParam('id', 'abc', { format: 'uuid' })).toMatch(/UUID/);
    expect(checkPathParam('d', '11.10.2026', { format: 'date' })).toMatch(/YYYY-MM-DD/);
    expect(checkPathParam('n', '1.5', { type: 'integer' })).toMatch(/integer/);
    expect(checkPathParam('id', { x: 1 }, { format: 'uuid' })).toMatch(/must be a string/);
    expect(checkPathParam('id', undefined, { format: 'uuid' })).toMatch(/missing/);
  });
});

describe('tool building', () => {
  const names = () => new Set(buildTools().map((t) => t.function.name));

  it('skips operations whose success response is binary (PDF/ZIP)', () => {
    const all = names();
    expect(all.has('get_invoices_by_id_pdf')).toBe(false);
    expect(all.has('get_tax_package_download')).toBe(false);
    // JSON operations of the same areas stay available.
    expect(all.has('get_invoices_by_id')).toBe(true);
    expect(all.has('get_tax_package_years')).toBe(true);
  });

  it('records declared path parameters (with their format) per operation', () => {
    expect(getOperationByName('get_clients_by_id')?.pathParams).toEqual({ id: { type: 'string', format: 'uuid' } });
  });

  it('normalizes Express-style ":id" path templates so they can be substituted', () => {
    // PUT /api/invoices/:id is annotated Express-style in invoice.routes.ts.
    const meta = getToolsWithMeta().filter((t) => t.method !== 'CUSTOM');
    expect(meta.some((t) => t.method === 'PUT' && t.pathTemplate === '/api/invoices/{id}')).toBe(true);
    expect(meta.filter((t) => t.pathTemplate.includes(':'))).toEqual([]);
  });

  it('validateToolArguments rejects malformed path parameters before execution/approval', () => {
    const bad = validateToolArguments('get_clients_by_id', { id: '..' });
    expect(bad.ok).toBe(false);
    const notUuid = validateToolArguments('delete_clients_by_id', { id: 'client-1' });
    expect(notUuid).toEqual({ ok: false, errors: ['path parameter "id" must be a UUID'] });
    expect(validateToolArguments('get_clients_by_id', { id: UUID })).toEqual({ ok: true });
  });
});

describe('executeToolCall', () => {
  beforeEach(() => {
    axiosMock.mockClear();
  });

  it('refuses unsafe or malformed path parameters without making a request', async () => {
    for (const id of ['..', '.', 'a/b', 'not-a-uuid']) {
      const r = await executeToolCall('get_clients_by_id', { id }, 'Bearer t', ['user']);
      expect(r.status).toBe(400);
      expect(r.error).toMatch(/path parameter "id"/);
    }
    const missing = await executeToolCall('get_clients_by_id', {}, 'Bearer t', ['user']);
    expect(missing.status).toBe(400);
    expect(axiosMock).not.toHaveBeenCalled();
  });

  it('substitutes a valid id and caps the response size', async () => {
    const r = await executeToolCall('get_clients_by_id', { id: UUID }, 'Bearer t', ['user']);
    expect(r.status).toBe(200);
    expect(axiosMock).toHaveBeenCalledTimes(1);
    const cfg = axiosMock.mock.calls[0][0];
    expect(cfg.url).toBe(`/api/clients/${UUID}`);
    expect(cfg.maxContentLength).toBe(2 * 1024 * 1024);
  });

  it('does not leak transport error text (internal host/port) into the result', async () => {
    axiosMock.mockRejectedValueOnce(Object.assign(new Error('connect ECONNREFUSED 10.1.2.3:8000'), { code: 'ECONNREFUSED' }));
    const r = await executeToolCall('get_clients', {}, 'Bearer t', ['user']);
    expect(r.status).toBe(500);
    expect(r.error).toContain('ECONNREFUSED');
    expect(r.error).not.toContain('10.1.2.3');
  });
});

describe('admin-only tools follow the routes’ real role guards', () => {
  it('lets every user use the per-user tax-rate / invoice-template APIs', () => {
    const meta = getToolsWithMeta();
    const taxRates = meta.filter((t) => t.pathTemplate.startsWith('/api/admin/tax-rates'));
    const templates = meta.filter((t) => t.pathTemplate.startsWith('/api/admin/invoice-templates'));
    expect(taxRates.length).toBeGreaterThan(0);
    expect(templates.length).toBeGreaterThan(0);
    for (const t of [...taxRates, ...templates]) expect(isToolAllowedForRoles(t, ['user'])).toBe(true);
  });

  it('treats requireAdmin routes as admin-only', () => {
    expect(isAdminOnlyOperation({ method: 'GET', pathTemplate: '/api/system/backups' })).toBe(true);
    expect(isAdminOnlyOperation({ method: 'POST', pathTemplate: '/api/system/backups/{id}/restore' })).toBe(true);
    expect(isAdminOnlyOperation({ method: 'POST', pathTemplate: '/api/system/initialize-users' })).toBe(true);
    expect(isAdminOnlyOperation({ method: 'GET', pathTemplate: '/api/settings' })).toBe(false);
    expect(isAdminOnlyOperation({ method: 'GET', pathTemplate: '/api/auth/profile/{id}' })).toBe(true);
    expect(isAdminOnlyOperation({ method: 'GET', pathTemplate: '/api/auth/users/all' })).toBe(true);
    expect(isAdminOnlyOperation({ method: 'GET', pathTemplate: '/api/auth/profile/me' })).toBe(false);
    expect(isToolAllowedForRoles({ method: 'GET', pathTemplate: '/api/auth/users/all' }, ['user'])).toBe(false);
    expect(isToolAllowedForRoles({ method: 'GET', pathTemplate: '/api/auth/users/all' }, ['admin'])).toBe(true);
    expect(isAdminOnlyOperation({ method: 'CUSTOM', pathTemplate: 'log_time_entry' })).toBe(false);
  });

  it('ADMIN_ONLY_ROUTES stays in sync with the route files that use role guards', () => {
    // If this fails, a route file started (or stopped) using requireAdmin /
    // requireRole / requireManager — update ADMIN_ONLY_ROUTES in
    // tool-selection.service.ts, then the expected list below.
    const root = path.resolve(__dirname, '../../src/routes');
    const guarded: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts')) {
          const code = fs
            .readFileSync(full, 'utf8')
            .split('\n')
            .filter((l) => !/^\s*(import|\*|\/\/|\/\*)/.test(l))
            .join('\n');
          if (/\b(requireAdmin|requireManager|requireRole\s*\()/.test(code)) {
            guarded.push(path.relative(root, full).split(path.sep).join('/'));
          }
        }
      }
    };
    walk(root);
    expect(guarded.sort()).toEqual([
      'auth/auth.routes.ts',
      'system/backup.routes.ts',
      'system/initialization.routes.ts',
    ]);
  });
});

describe('log_time_entry project matching', () => {
  const projects = [
    { id: 'p1', name: 'Acme Website', status: 'active' },
    { id: 'p2', name: 'Acme Website', status: 'completed' },
    { id: 'p3', name: 'Acme Shop', status: 'active' },
    { id: 'p4', name: 'Beta Relaunch', status: 'active' },
    { id: 'p5', name: 'Beta Relaunch 2023', status: 'completed' },
    { id: UUID, name: 'Gamma', status: 'on_hold' },
  ];

  it('prefers the single active project among exact name matches', () => {
    expect(matchProject('acme website', projects)).toEqual({ id: 'p1', name: 'Acme Website' });
  });

  it('accepts a unique partial match and prefers the active one among partials', () => {
    expect(matchProject('shop', projects)).toEqual({ id: 'p3', name: 'Acme Shop' });
    expect(matchProject('relaunch', projects)).toEqual({ id: 'p4', name: 'Beta Relaunch' });
  });

  it('refuses ambiguous partial matches instead of silently picking one', () => {
    expect(() => matchProject('acme', projects)).toThrow(/ambiguous.*Ask the user/);
  });

  it('resolves a UUID to its project name and rejects unknown ids', () => {
    expect(matchProject(UUID, projects)).toEqual({ id: UUID, name: 'Gamma' });
    expect(() => matchProject('7c9e6679-7425-40de-944b-e07fc1f90ae7', projects)).toThrow(/No project with id/);
  });

  it('lists active projects when nothing matches', () => {
    expect(() => matchProject('Delta', projects)).toThrow(/No project matches "Delta".*Beta Relaunch/);
  });
});
