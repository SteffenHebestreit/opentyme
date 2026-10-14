/**
 * Pure helpers behind the API token UI: expiry choices, the expiry warning,
 * and permission presets.
 */
import {
  expiryState,
  expiryToIso,
  grantedResources,
  grantsAnything,
  presetResources,
} from '../../src/components/admin/api-tokens/apiTokenHelpers';
import type { ApiTokenCatalog } from '../../src/api/types';

const catalog: ApiTokenCatalog = {
  levels: ['none', 'read', 'write', 'delete'],
  resources: [
    { key: 'clients', levels: ['none', 'read', 'write', 'delete'] },
    { key: 'time_entries', levels: ['none', 'read', 'write', 'delete'] },
    { key: 'invoices', levels: ['none', 'read', 'write', 'delete'] },
    { key: 'reports', levels: ['none', 'read'] },
  ],
  capabilities: [{ key: 'assistant' }, { key: 'mcp' }, { key: 'email_send' }],
  approvalModes: ['self', 'in_app'],
};

const NOW = new Date('2026-10-14T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('expiryToIso', () => {
  it('adds the chosen number of days', () => {
    expect(expiryToIso('30', '', NOW)).toBe(new Date(NOW.getTime() + 30 * DAY).toISOString());
  });

  it('returns null for "never"', () => {
    expect(expiryToIso('never', '', NOW)).toBeNull();
  });

  it('includes the whole custom day, in local time', () => {
    const iso = expiryToIso('custom', '2026-12-03', NOW)!;
    const local = new Date(iso);
    expect([local.getFullYear(), local.getMonth(), local.getDate(), local.getHours(), local.getMinutes()]).toEqual([
      2026, 11, 3, 23, 59,
    ]);
  });

  it('rejects a missing or past custom date', () => {
    expect(expiryToIso('custom', '', NOW)).toBeUndefined();
    expect(expiryToIso('custom', '2020-01-01', NOW)).toBeUndefined();
  });
});

describe('expiryState', () => {
  it.each([
    [null, { kind: 'never' }],
    [new Date(NOW.getTime() - 1000).toISOString(), { kind: 'expired' }],
    [new Date(NOW.getTime() + 2 * DAY + 1000).toISOString(), { kind: 'soon', days: 3 }],
    [new Date(NOW.getTime() + 7 * DAY).toISOString(), { kind: 'soon', days: 7 }],
    [new Date(NOW.getTime() + 8 * DAY).toISOString(), { kind: 'later' }],
  ])('%s → %j', (expiresAt, expected) => {
    expect(expiryState(expiresAt, NOW)).toEqual(expected);
  });
});

describe('permissions', () => {
  it('knows whether anything is granted', () => {
    expect(grantsAnything({ resources: {}, capabilities: [] })).toBe(false);
    expect(grantsAnything({ resources: { clients: 'none' }, capabilities: [] })).toBe(false);
    expect(grantsAnything({ resources: { clients: 'read' }, capabilities: [] })).toBe(true);
    expect(grantsAnything({ resources: {}, capabilities: ['mcp'] })).toBe(true);
  });

  it('lists granted resources in catalog order', () => {
    expect(
      grantedResources({ resources: { reports: 'read', clients: 'write', invoices: 'none' }, capabilities: [] }, catalog)
    ).toEqual([
      { key: 'clients', level: 'write' },
      { key: 'reports', level: 'read' },
    ]);
  });

  it('caps presets at what each resource supports', () => {
    expect(presetResources('full', catalog)).toEqual({
      clients: 'delete',
      time_entries: 'delete',
      invoices: 'delete',
      reports: 'read',
    });
    expect(presetResources('readOnly', catalog)).toEqual({
      clients: 'read',
      time_entries: 'read',
      invoices: 'read',
      reports: 'read',
    });
    expect(presetResources('timeTracking', catalog)).toEqual({
      clients: 'read',
      time_entries: 'write',
      reports: 'read',
    });
  });
});
