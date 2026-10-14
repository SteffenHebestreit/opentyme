/**
 * @fileoverview What a personal access token may do.
 *
 * The single source of truth for API-token permissions: the catalog the UI
 * renders and validation checks against, and the policy that maps a request
 * (method + path) to the permission it needs. The auth middleware, the AI tool
 * filter and the MCP tool list all ask this module, so they cannot disagree.
 *
 * Levels are cumulative: delete ⊃ write ⊃ read. GET is a read, DELETE is a
 * delete, everything else is a write — except the few routes in OVERRIDES.
 *
 * The policy fails closed. A path no rule classifies is denied, and
 * tests/unit/api-token-permissions.test.ts walks the real router so a new
 * route prefix cannot ship unclassified.
 *
 * @module services/auth/api-token-permissions
 */

export const PERMISSION_LEVELS = ['none', 'read', 'write', 'delete'] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

const LEVEL_RANK: Record<PermissionLevel, number> = { none: 0, read: 1, write: 2, delete: 3 };

export const RESOURCE_KEYS = [
  'clients',
  'projects',
  'time_entries',
  'expenses',
  'invoices',
  'payments',
  'tax',
  'templates',
  'reports',
  'addons',
] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];

export const CAPABILITY_KEYS = ['assistant', 'mcp', 'email_send'] as const;
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export const APPROVAL_MODES = ['self', 'in_app'] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

/** Stored on api_tokens.permissions. Missing resources mean 'none'. */
export interface ApiTokenPermissions {
  resources: Partial<Record<ResourceKey, PermissionLevel>>;
  capabilities: CapabilityKey[];
}

interface ResourceDefinition {
  key: ResourceKey;
  /** Highest level the resource supports — reports have nothing to change. */
  maxLevel: PermissionLevel;
  /** Mount paths the resource covers (addon paths are registered at runtime). */
  paths: string[];
}

interface CapabilityDefinition {
  key: CapabilityKey;
  paths: string[];
}

export const RESOURCES: readonly ResourceDefinition[] = [
  { key: 'clients', maxLevel: 'delete', paths: ['/api/clients'] },
  { key: 'projects', maxLevel: 'delete', paths: ['/api/projects'] },
  { key: 'time_entries', maxLevel: 'delete', paths: ['/api/time-entries'] },
  { key: 'expenses', maxLevel: 'delete', paths: ['/api/expenses'] },
  { key: 'invoices', maxLevel: 'delete', paths: ['/api/invoices', '/api/recurring-invoices'] },
  { key: 'payments', maxLevel: 'delete', paths: ['/api/payments'] },
  {
    key: 'tax',
    maxLevel: 'delete',
    paths: ['/api/tax-prepayments', '/api/depreciation', '/api/admin/tax-rates', '/api/tax-package'],
  },
  { key: 'templates', maxLevel: 'delete', paths: ['/api/admin/invoice-templates', '/api/email-templates'] },
  { key: 'reports', maxLevel: 'read', paths: ['/api/analytics', '/api/reports', '/api/insights'] },
  { key: 'addons', maxLevel: 'delete', paths: [] },
];

export const CAPABILITIES: readonly CapabilityDefinition[] = [
  // The OpenTyme assistant. Its tools call the API with the same token, so
  // they stay within the token's resource permissions.
  { key: 'assistant', paths: ['/api/ai'] },
  { key: 'mcp', paths: ['/api/mcp'] },
  // Sending mail can attach invoice and report PDFs.
  { key: 'email_send', paths: ['/api/email'] },
];

/**
 * Never reachable with a token, whatever its permissions: identity, system
 * administration, settings (writing ai_api_url would let a token redirect the
 * assistant's traffic) and token management itself, so a token can never mint
 * or widen tokens.
 */
const NEVER_PATHS = ['/api/auth', '/api/password-reset', '/api/system', '/api/settings', '/api/api-tokens'];

/**
 * Plugin management lives under /api/plugins, and so do some addons' own
 * routes (e.g. /api/plugins/ai-expense-analysis). Management routes are
 * matched first so an addon permission can never reach them.
 */
const PLUGIN_MANAGEMENT = /^\/api\/plugins(\/[^/]+(\/(enable|disable|settings))?)?$/;

export type Requirement =
  | { allowed: false; reason: 'never' | 'unmapped' }
  | {
      allowed: true;
      resource?: { key: ResourceKey; level: PermissionLevel };
      capability?: CapabilityKey;
    };

const OVERRIDES: ReadonlyArray<{ method: string; path: RegExp; requirement: Requirement }> = [
  // The calling token describes itself; it needs no permission for that.
  { method: 'GET', path: /^\/api\/api-tokens\/current$/, requirement: { allowed: true } },
  // POST only to carry a body — nothing is changed.
  {
    method: 'POST',
    path: /^\/api\/email-templates(\/[^/]+)?\/preview$/,
    requirement: { allowed: true, resource: { key: 'templates', level: 'read' } },
  },
  {
    method: 'POST',
    path: /^\/api\/invoices\/[^/]+\/validate-payment$/,
    requirement: { allowed: true, resource: { key: 'invoices', level: 'read' } },
  },
  // Not a DELETE, but irreversible: cancelling issues a cancellation invoice.
  {
    method: 'PATCH',
    path: /^\/api\/invoices\/[^/]+\/cancel$/,
    requirement: { allowed: true, resource: { key: 'invoices', level: 'delete' } },
  },
  // Emailing a report needs the report and the right to send mail.
  {
    method: 'POST',
    path: /^\/api\/reports\/email$/,
    requirement: { allowed: true, resource: { key: 'reports', level: 'read' }, capability: 'email_send' },
  },
];

const addonPaths: string[] = [];

/**
 * Called by the plugin loader for each addon route prefix it mounts, so
 * those routes fall under the 'addons' permission instead of being denied.
 */
export function registerAddonRoutePrefix(prefix: string): void {
  const normalized = normalizePath(prefix);
  if (!addonPaths.includes(normalized)) addonPaths.push(normalized);
}

/**
 * Express routes case-insensitively and ignores a trailing slash; match the
 * same way so the policy and the router agree on which router a path reaches.
 */
function normalizePath(path: string): string {
  const lower = path.split('?')[0].toLowerCase();
  return lower.length > 1 && lower.endsWith('/') ? lower.replace(/\/+$/, '') : lower;
}

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/');
}

function levelForMethod(method: string): PermissionLevel {
  switch (method.toUpperCase()) {
    case 'GET':
    case 'HEAD':
    case 'OPTIONS':
      return 'read';
    case 'DELETE':
      return 'delete';
    default:
      return 'write';
  }
}

/** The permission a request needs, or why no token may make it. */
export function requirementFor(method: string, rawPath: string): Requirement {
  const path = normalizePath(rawPath);
  const verb = method.toUpperCase();

  for (const override of OVERRIDES) {
    if (override.method === verb && override.path.test(path)) return override.requirement;
  }

  if (NEVER_PATHS.some((p) => under(path, p)) || PLUGIN_MANAGEMENT.test(path)) {
    return { allowed: false, reason: 'never' };
  }

  for (const capability of CAPABILITIES) {
    if (capability.paths.some((p) => under(path, p))) {
      return { allowed: true, capability: capability.key };
    }
  }

  for (const resource of RESOURCES) {
    const paths = resource.key === 'addons' ? addonPaths : resource.paths;
    if (paths.some((p) => under(path, p))) {
      return { allowed: true, resource: { key: resource.key, level: levelForMethod(verb) } };
    }
  }

  return { allowed: false, reason: 'unmapped' };
}

export function hasLevel(granted: PermissionLevel | undefined, needed: PermissionLevel): boolean {
  return LEVEL_RANK[granted ?? 'none'] >= LEVEL_RANK[needed];
}

/** "invoices:write", "capability:email_send" — what an error tells the caller it lacks. */
export type PermissionCheck = { ok: true } | { ok: false; missing: string };

export function checkPermission(permissions: ApiTokenPermissions, requirement: Requirement): PermissionCheck {
  if (!requirement.allowed) {
    return { ok: false, missing: requirement.reason === 'never' ? 'not available to API tokens' : 'unknown route' };
  }
  const { resource, capability } = requirement;
  if (resource && !hasLevel(permissions.resources[resource.key], resource.level)) {
    return { ok: false, missing: `${resource.key}:${resource.level}` };
  }
  if (capability && !permissions.capabilities.includes(capability)) {
    return { ok: false, missing: `capability:${capability}` };
  }
  return { ok: true };
}

/** May a token with these permissions call `method path`? */
export function isRequestAllowed(permissions: ApiTokenPermissions, method: string, path: string): boolean {
  return checkPermission(permissions, requirementFor(method, path)).ok;
}

/** Levels a resource accepts, for validation and the UI picker. */
export function levelsFor(resource: ResourceKey): PermissionLevel[] {
  const def = RESOURCES.find((r) => r.key === resource);
  const max = LEVEL_RANK[def?.maxLevel ?? 'none'];
  return PERMISSION_LEVELS.filter((level) => LEVEL_RANK[level] <= max);
}

/** The catalog the UI builds its permission picker from. */
export function permissionCatalog() {
  return {
    levels: [...PERMISSION_LEVELS],
    resources: RESOURCES.map((r) => ({ key: r.key, levels: levelsFor(r.key) })),
    capabilities: CAPABILITIES.map((c) => ({ key: c.key })),
    approvalModes: [...APPROVAL_MODES],
  };
}

/**
 * Keep only known resources at levels they support, and known capabilities
 * once each — so what is stored is exactly what is granted, and a row edited
 * by hand can only ever lose permissions, never gain unknown ones.
 */
export function normalizePermissions(input: Partial<ApiTokenPermissions> | null | undefined): ApiTokenPermissions {
  const resources: ApiTokenPermissions['resources'] = {};
  for (const key of RESOURCE_KEYS) {
    const level = input?.resources?.[key];
    if (level && level !== 'none' && levelsFor(key).includes(level)) resources[key] = level;
  }
  const granted = Array.isArray(input?.capabilities) ? input!.capabilities : [];
  const capabilities = CAPABILITY_KEYS.filter((c) => granted.includes(c));
  return { resources, capabilities };
}
