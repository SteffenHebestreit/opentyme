/**
 * Pure helpers for tool-call handling: lenient argument parsing and stable
 * call identity for repeat detection. Dependency-free so they stay trivially
 * unit-testable (no transitive ESM/database imports).
 */

import { LLMToolCall } from './conversation-history.service';

export function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

/** Recursively sorts object keys for a stable serialization. */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/** Stable identity of a tool call (name + normalized arguments) for repeat detection. */
export function stableCallKey(tc: LLMToolCall): string {
  return `${tc.function.name}::${JSON.stringify(sortKeysDeep(safeParseArgs(tc.function.arguments)))}`;
}

/**
 * Parses tool-call arguments leniently: unwinds double-stringified JSON (a
 * documented local-model habit) and, on failure, reports a precise error so the
 * model can repair the call — instead of silently executing with {}.
 */
export function parseToolArguments(
  raw: string
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  try {
    let v: unknown = JSON.parse(raw || '{}');
    if (typeof v === 'string') v = JSON.parse(v);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return { ok: true, args: v as Record<string, unknown> };
    }
    return { ok: false, error: `arguments must be a JSON object, got ${Array.isArray(v) ? 'array' : typeof v}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
