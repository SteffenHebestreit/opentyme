/**
 * @fileoverview Tenant ownership checks for rows referenced by id.
 *
 * Every business row carries a `user_id`, and registration is open, so any id
 * that arrives in a request body (an invoice's client_id, a time entry's
 * project_id, a payment's invoice_ids, ...) may belong to somebody else. A
 * foreign key only proves the row EXISTS — not that the caller owns it. Writing
 * such an id would attach the caller's data to another tenant's row, and every
 * later read that joins through it (client name on the invoice, project name on
 * the time entry, the client's billing address on the PDF) would hand the
 * caller that tenant's data.
 *
 * These helpers answer "does this user own these ids?" in one query per table.
 * Malformed ids are reported as not owned instead of letting Postgres raise
 * 22P02 (invalid uuid), which would surface as a 500.
 *
 * @module services/ownership
 */

import { getDbClient } from '../utils/database';

/**
 * Tables that carry a `user_id` column and can be referenced by id from a
 * request. The map is the whitelist: table names are interpolated into SQL, so
 * nothing outside it may ever reach the query.
 */
const OWNED_TABLES = {
  clients: 'clients',
  projects: 'projects',
  invoices: 'invoices',
  time_entries: 'time_entries',
  expenses: 'expenses',
  tax_rates: 'tax_rates',
  invoice_text_templates: 'invoice_text_templates',
} as const;

export type OwnedTable = keyof typeof OWNED_TABLES;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a value is a syntactically valid UUID (any version).
 *
 * @param {unknown} value - Candidate id
 * @returns {boolean} True for a UUID string
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Returns the ids among `ids` that the user does NOT own — including ids that
 * do not exist at all and malformed ids. An empty result means every id is the
 * user's.
 *
 * @param {OwnedTable} table - Table the ids point into
 * @param {string[]} ids - Ids to check (duplicates allowed)
 * @param {string} userId - The authenticated user
 * @returns {Promise<string[]>} The ids the user does not own, in input order
 */
export async function findUnownedIds(table: OwnedTable, ids: string[], userId: string): Promise<string[]> {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return [];

  const wellFormed = unique.filter(isUuid);
  const owned = new Set<string>();

  if (wellFormed.length > 0) {
    const result = await getDbClient().query(
      `SELECT id FROM ${OWNED_TABLES[table]} WHERE id = ANY($1::uuid[]) AND user_id = $2`,
      [wellFormed, userId]
    );
    for (const row of result.rows) owned.add(String(row.id).toLowerCase());
  }

  return unique.filter((id) => !owned.has(String(id).toLowerCase()));
}

/**
 * Whether the user owns a single row.
 *
 * @param {OwnedTable} table - Table the id points into
 * @param {string} id - Row id
 * @param {string} userId - The authenticated user
 * @returns {Promise<boolean>} True when the row exists and is the user's
 */
export async function ownsRow(table: OwnedTable, id: string, userId: string): Promise<boolean> {
  return (await findUnownedIds(table, [id], userId)).length === 0;
}

/** A reference from a request body to a row that must belong to the caller. */
export interface OwnedReference {
  /** Table the id points into */
  table: OwnedTable;
  /** The referenced id; null/undefined/'' mean "no reference" and are skipped */
  id: string | null | undefined;
  /** Request field the id came from, reported back to the client */
  field: string;
}

/**
 * Raised when a request references a row the caller does not own (or that does
 * not exist). Controllers map it to `400 { code: 'INVALID_REFERENCE', field }`.
 * The message never says whether the row exists for someone else.
 */
export class ForeignReferenceError extends Error {
  readonly code = 'INVALID_REFERENCE';
  readonly field: string;

  constructor(field: string) {
    super(`Invalid ${field}: referenced record not found`);
    this.name = 'ForeignReferenceError';
    this.field = field;
  }
}

/**
 * Throws ForeignReferenceError for the first reference the user does not own.
 * Empty references (null, undefined, '') are skipped, so optional fields can be
 * passed as they come.
 *
 * @param {OwnedReference[]} refs - References to check
 * @param {string} userId - The authenticated user
 * @returns {Promise<void>} Resolves when every reference is the user's
 * @throws {ForeignReferenceError} On the first foreign or unknown id
 */
export async function assertOwnedReferences(refs: OwnedReference[], userId: string): Promise<void> {
  for (const ref of refs) {
    if (ref.id === null || ref.id === undefined || ref.id === '') continue;
    if (!(await ownsRow(ref.table, ref.id, userId))) {
      throw new ForeignReferenceError(ref.field);
    }
  }
}

/**
 * Standard 400 body for a ForeignReferenceError. Carries both `error` and
 * `message` because the controllers in this codebase use either key.
 *
 * @param {ForeignReferenceError} err - The error to describe
 * @returns {object} Response body
 */
export function invalidReferenceBody(err: ForeignReferenceError) {
  return {
    error: 'Invalid reference',
    message: err.message,
    code: err.code,
    field: err.field,
  };
}
