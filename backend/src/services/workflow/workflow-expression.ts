/**
 * @fileoverview References, placeholders and conditions over a run's data.
 *
 * A flow never contains code. A configured value is a literal, a reference
 * `{ $ref: 'steps.n3.documentId' }`, or text with `{{path}}` placeholders; a
 * condition is a list of `left op right` rules. Everything here is a pure
 * function of the run's data.
 *
 * @module services/workflow/workflow-expression
 */

import type { WorkflowCondition, WorkflowConditionRule, WorkflowValue } from '../../types/workflow.types';

const PATH_SEGMENT = /^[A-Za-z0-9_-]+$/;
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

export function isRef(value: unknown): value is { $ref: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { $ref?: unknown }).$ref === 'string'
  );
}

export function isValidPath(path: string): boolean {
  return path.length > 0 && path.length <= 200 && path.split('.').every((segment) => PATH_SEGMENT.test(segment));
}

/**
 * Reads `a.b.c` from the run's data. Own properties only, so a path can never
 * reach `__proto__` or `constructor`; anything missing is undefined.
 */
export function getPath(data: unknown, path: string): unknown {
  if (!isValidPath(path)) return undefined;
  let current: unknown = data;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Replaces `{{path}}` placeholders; an unknown path becomes an empty string. */
export function interpolate(text: string, data: unknown): string {
  return text.replace(PLACEHOLDER, (_match, path: string) => toText(getPath(data, path)));
}

/** A configured value against the run's data: references looked up, text interpolated. */
export function resolveValue(value: WorkflowValue | undefined, data: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (isRef(value)) return getPath(data, value.$ref) ?? null;
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, data));
  if (typeof value === 'string') return interpolate(value, data);
  return value;
}

/** Every path a configured value refers to (references and placeholders). */
export function collectPaths(value: WorkflowValue | undefined): string[] {
  if (value === undefined || value === null) return [];
  if (isRef(value)) return [value.$ref];
  if (Array.isArray(value)) return value.flatMap((item) => collectPaths(item));
  if (typeof value === 'string') return Array.from(value.matchAll(PLACEHOLDER), (match) => match[1]);
  return [];
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** -1 / 0 / 1; numeric when both sides are numbers, otherwise as text (ISO dates sort correctly). */
function compare(left: unknown, right: unknown): number {
  const a = asNumber(left);
  const b = asNumber(right);
  if (a !== null && b !== null) return a === b ? 0 : a < b ? -1 : 1;
  const textA = toText(left);
  const textB = toText(right);
  return textA === textB ? 0 : textA < textB ? -1 : 1;
}

export function evaluateRule(rule: WorkflowConditionRule, data: unknown): boolean {
  const left = getPath(data, rule.left);
  const right = rule.right ?? null;
  switch (rule.op) {
    case 'empty':
      return isEmpty(left);
    case 'not_empty':
      return !isEmpty(left);
    case 'eq':
      return compare(left, right) === 0;
    case 'ne':
      return compare(left, right) !== 0;
    case 'gt':
      return !isEmpty(left) && compare(left, right) > 0;
    case 'gte':
      return !isEmpty(left) && compare(left, right) >= 0;
    case 'lt':
      return !isEmpty(left) && compare(left, right) < 0;
    case 'lte':
      return !isEmpty(left) && compare(left, right) <= 0;
    case 'contains':
      return Array.isArray(left)
        ? left.some((item) => compare(item, right) === 0)
        : toText(left).toLowerCase().includes(toText(right).toLowerCase());
    default:
      return false;
  }
}

/** A condition without rules never holds — an empty rule list is a drawing mistake, not "always". */
export function evaluateCondition(condition: WorkflowCondition, data: unknown): boolean {
  if (!condition.rules || condition.rules.length === 0) return false;
  return condition.match === 'any'
    ? condition.rules.some((rule) => evaluateRule(rule, data))
    : condition.rules.every((rule) => evaluateRule(rule, data));
}
