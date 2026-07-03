/**
 * Conversation history for the AI assistant: shared message/tool-call types,
 * loading the recent window from the database, normalizing it into an
 * API-valid message sequence, and bounding the tool-result context size.
 */

import { pool } from '../../utils/database';
import { BoundedLru } from '../../utils/bounded-lru';

// ---- Shared types -----------------------------------------------------------

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string | null;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
  name?: string;
}

// ---- Tunables ----------------------------------------------------------------

/** Number of most-recent messages to load as context for each run. */
export const HISTORY_LIMIT = Number(process.env.AI_HISTORY_LIMIT) || 40;

/** Max cumulative characters of tool-result content sent to the model per call. */
export const TOOL_CONTEXT_BUDGET = Number(process.env.AI_TOOL_CONTEXT_BUDGET) || 24000;

// ---- Normalization -----------------------------------------------------------

/**
 * Makes a loaded history window valid for the chat-completions API:
 *
 * 1. Drops orphan tool results whose originating assistant message was trimmed
 *    off the front of the window.
 * 2. Injects a synthetic "not executed" tool result for every assistant
 *    tool_call that never received one (e.g. writes whose approval was
 *    abandoned before this state was persisted) — dangling tool_calls are an
 *    invalid sequence for OpenAI-compatible APIs.
 *
 * `keepDanglingIds` exempts tool_calls that the caller is about to answer with
 * real results (the resume-after-approval flow) from synthetic injection.
 */
export function normalizeHistoryWindow(
  messages: ConversationMessage[],
  keepDanglingIds: ReadonlySet<string> = new Set()
): ConversationMessage[] {
  // Pass 1: drop orphan tool results.
  const knownToolCallIds = new Set<string>();
  const filtered: ConversationMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) knownToolCallIds.add(tc.id);
    }
    if (msg.role === 'tool' && (!msg.tool_call_id || !knownToolCallIds.has(msg.tool_call_id))) {
      continue;
    }
    filtered.push(msg);
  }

  // Pass 2: answer dangling tool_calls with synthetic results, right after
  // their assistant message so the tool block stays contiguous.
  const answered = new Set(
    filtered.filter((m) => m.role === 'tool' && m.tool_call_id).map((m) => m.tool_call_id as string)
  );
  const result: ConversationMessage[] = [];
  for (const msg of filtered) {
    result.push(msg);
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (!answered.has(tc.id) && !keepDanglingIds.has(tc.id)) {
          result.push({
            role: 'tool',
            content: JSON.stringify({
              not_executed: true,
              message: 'This proposed action was never executed (superseded or cancelled).',
            }),
            tool_call_id: tc.id,
            name: tc.function.name,
          });
        }
      }
    }
  }
  return result;
}

/**
 * Returns a copy of the messages with older tool-result contents truncated so
 * the cumulative tool context stays within TOOL_CONTEXT_BUDGET. Keeps the most
 * recent results intact and never drops messages (preserves tool pairing).
 */
export function applyToolContextBudget(messages: ConversationMessage[]): ConversationMessage[] {
  const result = messages.map((m) => ({ ...m }));
  let total = 0;
  for (let i = result.length - 1; i >= 0; i--) {
    const m = result[i];
    if (m.role !== 'tool' || !m.content) continue;
    if (total >= TOOL_CONTEXT_BUDGET) {
      m.content = '[older tool result omitted to save context]';
      continue;
    }
    total += m.content.length;
    if (total > TOOL_CONTEXT_BUDGET) {
      const keep = Math.max(0, m.content.length - (total - TOOL_CONTEXT_BUDGET));
      m.content = m.content.slice(0, keep) + '…[truncated]';
    }
  }
  return result;
}

// ---- Loading -------------------------------------------------------------------

// Window hysteresis (prefix-cache friendly). A plain "newest N" window shifts
// its start by one on every message, so the prompt prefix changes every turn
// and the local inference server re-prefills the whole conversation. Instead we
// anchor the window start and only move it when the window overflows — trimming
// down to TRIM_TO so the anchor then holds for many turns. In-memory (single
// replica); losing an anchor on restart just means one full re-prefill.
const TRIM_TO = Math.max(10, Math.floor(HISTORY_LIMIT * 0.75));
const windowAnchors = new BoundedLru<unknown>(500);

/**
 * Loads the recent message window for a conversation in chronological,
 * API-valid order, keeping the window start stable across turns (hysteresis).
 */
export async function loadHistory(
  conversationId: string,
  keepDanglingIds?: ReadonlySet<string>
): Promise<ConversationMessage[]> {
  const db = pool();

  let rows: Array<Record<string, unknown>> | null = null;
  const anchor = windowAnchors.get(conversationId);
  if (anchor !== undefined) {
    const r = await db.query(
      `SELECT role, content, tool_calls, tool_call_id, tool_name, created_at
       FROM ai_messages
       WHERE conversation_id = $1 AND created_at >= $2
       ORDER BY created_at ASC, id ASC
       LIMIT $3`,
      [conversationId, anchor, HISTORY_LIMIT * 2]
    );
    // Anchor stale (no rows) or window runaway (hit the safety limit) → refetch.
    if (r.rows.length > 0 && r.rows.length < HISTORY_LIMIT * 2) rows = r.rows;
  }

  if (!rows) {
    const r = await db.query(
      `SELECT role, content, tool_calls, tool_call_id, tool_name, created_at
       FROM ai_messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [conversationId, HISTORY_LIMIT]
    );
    rows = r.rows.reverse();
  }

  // Overflow → trim once to TRIM_TO newest messages; the new anchor then holds.
  if (rows.length > HISTORY_LIMIT) {
    rows = rows.slice(-TRIM_TO);
  }
  if (rows.length > 0) {
    windowAnchors.set(conversationId, rows[0].created_at);
  }

  return normalizeHistoryWindow(
    rows.map((row) => ({
      role: row.role as ConversationMessage['role'],
      content: row.content as string | null,
      ...(row.tool_calls ? { tool_calls: row.tool_calls as LLMToolCall[] } : {}),
      ...(row.tool_call_id ? { tool_call_id: row.tool_call_id as string } : {}),
      ...(row.tool_name ? { name: row.tool_name as string } : {}),
    })),
    keepDanglingIds
  );
}
