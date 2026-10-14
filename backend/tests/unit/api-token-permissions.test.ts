/**
 * Personal access token permissions and token format.
 *
 * The policy is the security boundary for every request made with a token, so
 * besides the table of expected classifications this walks the real router:
 * every /api route must be classified (a resource, a capability, or "never"),
 * so a new route prefix can't ship reachable-by-accident or broken-by-accident.
 */

process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ??= 'test-secret';

// The Keycloak admin client is ESM-only, which Jest can't load; nothing here talks to Keycloak.
jest.mock('@keycloak/keycloak-admin-client', () => ({
  __esModule: true,
  default: class {
    users = { findOne: jest.fn() };
    realms = { findOne: jest.fn() };
    auth = jest.fn();
  },
}));

import express from 'express';
import {
  ApiTokenPermissions,
  Requirement,
  checkPermission,
  levelsFor,
  normalizePermissions,
  permissionCatalog,
  registerAddonRoutePrefix,
  requirementFor,
} from '../../src/services/auth/api-token-permissions';
import {
  generateApiToken,
  hasValidApiTokenFormat,
  hashApiToken,
  isApiToken,
} from '../../src/services/auth/api-token.service';
import { getToolsWithMeta } from '../../src/services/ai/openapi-tool-builder.service';
import setupRoutes from '../../src/routes';

function describeRequirement(r: Requirement): string {
  if (!r.allowed) return r.reason;
  const parts: string[] = [];
  if (r.resource) parts.push(`${r.resource.key}:${r.resource.level}`);
  if (r.capability) parts.push(`capability:${r.capability}`);
  return parts.join('+') || 'self';
}

describe('token format', () => {
  it('generates prefixed tokens with a valid checksum and a matching hash', () => {
    const { secret, hash, prefix } = generateApiToken();
    expect(secret).toMatch(/^oty_pat_[0-9A-Za-z]{46}$/);
    expect(isApiToken(secret)).toBe(true);
    expect(hasValidApiTokenFormat(secret)).toBe(true);
    expect(hash).toBe(hashApiToken(secret));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(prefix).toBe(secret.slice(0, 12));
  });

  it('never repeats a token', () => {
    const secrets = new Set(Array.from({ length: 500 }, () => generateApiToken().secret));
    expect(secrets.size).toBe(500);
  });

  it('rejects a token with one character changed (checksum)', () => {
    const { secret } = generateApiToken();
    const i = 20;
    const flipped = secret.slice(0, i) + (secret[i] === 'a' ? 'b' : 'a') + secret.slice(i + 1);
    expect(hasValidApiTokenFormat(flipped)).toBe(false);
  });

  it('rejects malformed tokens', () => {
    expect(hasValidApiTokenFormat('oty_pat_short')).toBe(false);
    expect(hasValidApiTokenFormat(generateApiToken().secret + 'x')).toBe(false);
    expect(hasValidApiTokenFormat('ghp_' + 'a'.repeat(50))).toBe(false);
    expect(isApiToken('eyJhbGciOiJSUzI1NiJ9.e30.sig')).toBe(false);
  });
});

describe('requirementFor', () => {
  beforeAll(() => registerAddonRoutePrefix('/api/plugins/ai-expense-analysis'));

  it.each([
    ['GET', '/api/clients', 'clients:read'],
    ['POST', '/api/clients', 'clients:write'],
    ['PUT', '/api/clients/abc', 'clients:write'],
    ['DELETE', '/api/clients/abc', 'clients:delete'],
    ['DELETE', '/api/clients/documents/abc', 'clients:delete'],
    ['POST', '/api/time-entries/start', 'time_entries:write'],
    ['PUT', '/api/time-entries/stop', 'time_entries:write'],
    ['GET', '/api/recurring-invoices', 'invoices:read'],
    ['PATCH', '/api/invoices/abc/cancel', 'invoices:delete'],
    ['POST', '/api/invoices/abc/correct', 'invoices:write'],
    ['POST', '/api/invoices/abc/validate-payment', 'invoices:read'],
    ['POST', '/api/email-templates/preview', 'templates:read'],
    ['POST', '/api/email-templates/abc/preview', 'templates:read'],
    ['GET', '/api/admin/tax-rates', 'tax:read'],
    ['GET', '/api/tax-package/download', 'tax:read'],
    ['GET', '/api/insights/time-summary', 'reports:read'],
    ['POST', '/api/reports/email', 'reports:read+capability:email_send'],
    ['POST', '/api/email/send', 'capability:email_send'],
    ['POST', '/api/ai/run', 'capability:assistant'],
    ['GET', '/api/plugins/ai-expense-analysis/analyze', 'addons:read'],
    ['GET', '/api/api-tokens/current', 'self'],
    ['GET', '/api/api-tokens', 'never'],
    ['POST', '/api/api-tokens', 'never'],
    ['DELETE', '/api/api-tokens/abc', 'never'],
    ['GET', '/api/settings', 'never'],
    ['PUT', '/api/settings', 'never'],
    ['PUT', '/api/auth/profile/me', 'never'],
    ['POST', '/api/password-reset/request', 'never'],
    ['POST', '/api/system/backups', 'never'],
    ['GET', '/api/plugins', 'never'],
    ['POST', '/api/plugins/ai-expense-analysis/enable', 'never'],
    ['GET', '/api/plugins/ai-expense-analysis/settings', 'never'],
    ['GET', '/api/plugins/some-other-addon/data', 'unmapped'],
    ['GET', '/api/clientsx', 'unmapped'],
    ['GET', '/api/unknown', 'unmapped'],
  ])('%s %s → %s', (method, path, expected) => {
    expect(describeRequirement(requirementFor(method, path))).toBe(expected);
  });

  it('matches like Express does: case-insensitive, trailing slash, query ignored', () => {
    expect(describeRequirement(requirementFor('GET', '/API/Settings/'))).toBe('never');
    expect(describeRequirement(requirementFor('get', '/api/Clients/?limit=5'))).toBe('clients:read');
  });
});

describe('checkPermission', () => {
  const perms = (resources: ApiTokenPermissions['resources'], capabilities: ApiTokenPermissions['capabilities'] = []) =>
    ({ resources, capabilities }) as ApiTokenPermissions;
  const req = (method: string, path: string) => requirementFor(method, path);

  it('treats levels as cumulative: delete ⊃ write ⊃ read', () => {
    const p = perms({ clients: 'write' });
    expect(checkPermission(p, req('GET', '/api/clients')).ok).toBe(true);
    expect(checkPermission(p, req('POST', '/api/clients')).ok).toBe(true);
    expect(checkPermission(p, req('DELETE', '/api/clients/x'))).toEqual({ ok: false, missing: 'clients:delete' });
    expect(checkPermission(perms({ clients: 'delete' }), req('DELETE', '/api/clients/x')).ok).toBe(true);
  });

  it('denies resources that were not granted', () => {
    expect(checkPermission(perms({ clients: 'delete' }), req('GET', '/api/invoices'))).toEqual({
      ok: false,
      missing: 'invoices:read',
    });
  });

  it('needs both parts of a combined requirement', () => {
    expect(checkPermission(perms({ reports: 'read' }), req('POST', '/api/reports/email')).ok).toBe(false);
    expect(checkPermission(perms({}, ['email_send']), req('POST', '/api/reports/email')).ok).toBe(false);
    expect(checkPermission(perms({ reports: 'read' }, ['email_send']), req('POST', '/api/reports/email')).ok).toBe(true);
  });

  it('never allows "never" routes, even with every permission', () => {
    const everything = perms(
      Object.fromEntries(permissionCatalog().resources.map((r) => [r.key, r.levels[r.levels.length - 1]])),
      ['assistant', 'mcp', 'email_send']
    );
    for (const [method, path] of [
      ['POST', '/api/api-tokens'],
      ['PUT', '/api/settings'],
      ['POST', '/api/system/backups'],
      ['GET', '/api/auth/users/all'],
      ['POST', '/api/plugins/x/enable'],
    ]) {
      expect(checkPermission(everything, req(method, path)).ok).toBe(false);
    }
  });
});

describe('catalog and normalization', () => {
  it('reports are read-only', () => {
    expect(levelsFor('reports')).toEqual(['none', 'read']);
    expect(levelsFor('clients')).toEqual(['none', 'read', 'write', 'delete']);
  });

  it('keeps only known resources at supported levels and known capabilities', () => {
    expect(
      normalizePermissions({
        resources: { clients: 'read', reports: 'write', projects: 'none', bogus: 'delete' } as any,
        capabilities: ['mcp', 'mcp', 'root'] as any,
      })
    ).toEqual({ resources: { clients: 'read' }, capabilities: ['mcp'] });
    expect(normalizePermissions(null)).toEqual({ resources: {}, capabilities: [] });
  });
});

describe('route coverage', () => {
  /** Mount path of an Express 4 router layer, recovered from its compiled regexp. */
  function mountPath(layer: any): string {
    if (layer.regexp.fast_slash) return '';
    return layer.regexp.source
      .replace('^', '')
      .replace('\\/?(?=\\/|$)', '')
      .replace(/\\\//g, '/');
  }

  function listRoutes(app: express.Application): Array<{ method: string; path: string }> {
    const routes: Array<{ method: string; path: string }> = [];
    const walk = (stack: any[], prefix: string) => {
      for (const layer of stack) {
        if (layer.route) {
          const paths: string[] = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
          for (const p of paths) {
            for (const method of Object.keys(layer.route.methods)) {
              if (method !== '_all') routes.push({ method: method.toUpperCase(), path: prefix + p });
            }
          }
        } else if (layer.name === 'router' && layer.handle?.stack) {
          walk(layer.handle.stack, prefix + mountPath(layer));
        }
      }
    };
    walk((app as any)._router.stack, '');
    return routes;
  }

  it('classifies every /api route', () => {
    const app = express();
    setupRoutes(app);
    const routes = listRoutes(app).filter((r) => r.path.startsWith('/api/'));
    expect(routes.length).toBeGreaterThan(150);

    const unclassified = routes
      .map((r) => ({ ...r, concrete: r.path.replace(/:[A-Za-z_]+/g, 'x1') }))
      .filter((r) => {
        const requirement = requirementFor(r.method, r.concrete);
        return !requirement.allowed && requirement.reason === 'unmapped';
      })
      .map((r) => `${r.method} ${r.path}`);

    expect(unclassified).toEqual([]);
  });
});

describe('assistant tools', () => {
  it('never offers token management as a tool (the assistant runs with the user session)', () => {
    const tokenTools = getToolsWithMeta().filter((t) => t.pathTemplate.startsWith('/api/api-tokens'));
    expect(tokenTools).toEqual([]);
  });
});
