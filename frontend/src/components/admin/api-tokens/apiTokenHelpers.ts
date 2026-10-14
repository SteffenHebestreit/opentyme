/**
 * @fileoverview Pure helpers for the API token UI: permission presets, expiry
 * choices and how a token's state is summarised. Kept free of React so they
 * can be tested on their own.
 *
 * @module components/admin/api-tokens/apiTokenHelpers
 */

import type {
  ApiTokenCatalog,
  ApiTokenLevel,
  ApiTokenPermissions,
  ApiTokenResource,
} from '../../../api/types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const LEVEL_RANK: Record<ApiTokenLevel, number> = { none: 0, read: 1, write: 2, delete: 3 };

export type ExpiryChoice = '7' | '30' | '90' | '365' | 'custom' | 'never';
export const EXPIRY_CHOICES: ExpiryChoice[] = ['7', '30', '90', '365', 'custom', 'never'];
export const DEFAULT_EXPIRY: ExpiryChoice = '30';

/**
 * The expires_at to send: an ISO date-time, null for "never", or undefined
 * when a custom date is missing or not in the future.
 */
export function expiryToIso(choice: ExpiryChoice, customYmd: string, now = new Date()): string | null | undefined {
  if (choice === 'never') return null;
  if (choice === 'custom') {
    if (!customYmd) return undefined;
    // End of the chosen day, local time: "expires on the 3rd" includes the 3rd.
    const end = new Date(`${customYmd}T23:59:59`);
    return Number.isNaN(end.getTime()) || end <= now ? undefined : end.toISOString();
  }
  return new Date(now.getTime() + Number(choice) * DAY_MS).toISOString();
}

export type ExpiryState =
  | { kind: 'never' }
  | { kind: 'expired' }
  | { kind: 'soon'; days: number }
  | { kind: 'later' };

/** Warn a week ahead, so there is time to rotate the token. */
export function expiryState(expiresAt: string | null, now = new Date()): ExpiryState {
  if (!expiresAt) return { kind: 'never' };
  const left = new Date(expiresAt).getTime() - now.getTime();
  if (left <= 0) return { kind: 'expired' };
  if (left <= 7 * DAY_MS) return { kind: 'soon', days: Math.ceil(left / DAY_MS) };
  return { kind: 'later' };
}

export function emptyPermissions(): ApiTokenPermissions {
  return { resources: {}, capabilities: [] };
}

export function grantsAnything(permissions: ApiTokenPermissions): boolean {
  return (
    permissions.capabilities.length > 0 ||
    Object.values(permissions.resources).some((level) => level && level !== 'none')
  );
}

/** Granted resources in catalog order, highest level first within ties. */
export function grantedResources(
  permissions: ApiTokenPermissions,
  catalog?: ApiTokenCatalog
): Array<{ key: ApiTokenResource; level: ApiTokenLevel }> {
  const order = catalog?.resources.map((r) => r.key) ?? (Object.keys(permissions.resources) as ApiTokenResource[]);
  return order
    .map((key) => ({ key, level: permissions.resources[key] ?? 'none' }))
    .filter((entry) => entry.level !== 'none');
}

export type PresetId = 'readOnly' | 'timeTracking' | 'bookkeeping' | 'full';
export const PRESET_IDS: PresetId[] = ['readOnly', 'timeTracking', 'bookkeeping', 'full'];

const PRESET_LEVELS: Record<Exclude<PresetId, 'readOnly' | 'full'>, Partial<Record<ApiTokenResource, ApiTokenLevel>>> = {
  timeTracking: { clients: 'read', projects: 'read', time_entries: 'write', reports: 'read' },
  bookkeeping: {
    clients: 'read',
    projects: 'read',
    time_entries: 'read',
    expenses: 'write',
    invoices: 'write',
    payments: 'write',
    tax: 'write',
    reports: 'read',
  },
};

/**
 * Resource levels for a preset, capped at what each resource supports.
 * Presets set data access only; features stay as the user chose them.
 */
export function presetResources(
  preset: PresetId,
  catalog: ApiTokenCatalog
): Partial<Record<ApiTokenResource, ApiTokenLevel>> {
  const resources: Partial<Record<ApiTokenResource, ApiTokenLevel>> = {};
  for (const { key, levels } of catalog.resources) {
    const highest = levels[levels.length - 1];
    const wanted: ApiTokenLevel =
      preset === 'full' ? highest : preset === 'readOnly' ? 'read' : PRESET_LEVELS[preset][key] ?? 'none';
    const capped = LEVEL_RANK[wanted] > LEVEL_RANK[highest] ? highest : wanted;
    if (capped !== 'none') resources[key] = capped;
  }
  return resources;
}
