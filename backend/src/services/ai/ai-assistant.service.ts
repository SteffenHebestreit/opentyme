/**
 * Core AI Assistant orchestration service.
 * Streams AG-UI protocol events back to the caller via the emitEvent callback.
 * Uses the user's Bearer token for all tool calls → enforces user-level authorization.
 *
 * Write tool calls (create/update/delete) are never executed automatically: the
 * run pauses and emits TOOL_APPROVAL_REQUIRED, then resumeRun() continues once the
 * user approves or rejects the proposed actions. If the user instead sends a new
 * message, the pending approval is superseded (declined results are persisted) so
 * the history stays a valid API message sequence and stale writes can't run later.
 * TOOL_APPROVAL_REQUIRED carries a batchId (the assistant message holding the
 * pending actions); /approve may echo it, and a stale one is refused.
 *
 * Cancellation: the controller aborts the run's signal when the client goes
 * away. Reads and LLM calls stop; an approved write already in flight is never
 * aborted (it finishes and is recorded), unstarted ones are re-armed. Only one
 * run per conversation is active at a time (run-lock.ts). RUN_ERROR events
 * carry generic messages with stable codes (toRunErrorEvent).
 *
 * Collaborators: system-prompt.builder (prompt), conversation-history.service
 * (types, loading, normalization, context budget), llm-stream.service (streaming
 * chat-completions), tool-selection.service (curation + role policy),
 * tool-executor.service (HTTP/custom tool dispatch).
 */

import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { pool } from '../../utils/database';
import { EventType, EventEmitter } from './ai-events';
import {
  ConversationMessage,
  LLMToolCall,
  loadHistory,
} from './conversation-history.service';
import {
  streamChatCompletion,
  LLMError,
  LLM_ERROR_MESSAGES,
  isAbortError,
  abortError,
} from './llm-stream.service';
import { safeParseArgs, sortKeysDeep, parseToolArguments, safeToolErrorMessage } from './tool-call-utils';
import { buildSystemPrompt } from './system-prompt.builder';
import { LLMTool, validateToolArguments } from './openapi-tool-builder.service';
import { selectTools } from './tool-selection.service';
import { executeToolCall, isWriteTool } from './tool-executor.service';
import { getCustomToolByName } from './ai-tool-registry.service';
import { runLockKey, tryAcquireRunLock, releaseRunLock } from './run-lock';
import { toolPermissionDenial } from './tool-permissions';
import { ApiTokenPermissions, ApprovalMode, normalizePermissions } from '../auth/api-token-permissions';

// Re-exported for existing importers (controller, A2A adapter).
export type { EventEmitter } from './ai-events';
export type { ConversationMessage } from './conversation-history.service';

/** The API token a request was made with (absent for the signed-in web app). */
export interface TokenAccess {
  tokenId: string;
  permissions: ApiTokenPermissions;
  approvalMode: ApprovalMode;
}

export interface ToolApprovalDecision {
  toolCallId: string;
  decision: 'approve' | 'reject';
  /** Approve-with-edit: corrected arguments to execute instead of the proposed ones. */
  editedArguments?: Record<string, unknown>;
}

const MAX_ITERATIONS = Number(process.env.AI_MAX_ITERATIONS) || 12;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Maps a failed run to its AG-UI RUN_ERROR event — or null when the run was
 * cancelled because the client went away (nobody is listening; stop quietly).
 * Clients only ever get a generic message plus a stable code: never raw
 * axios/Postgres text or internal hostnames (those are logged instead).
 */
export function toRunErrorEvent(error: unknown, signal?: AbortSignal, where = 'run'): Record<string, unknown> | null {
  if (isAbortError(error) || signal?.aborted) {
    logger.info(`[AI] ${where}: cancelled by the client`);
    return null;
  }
  if (error instanceof LLMError) {
    // Upstream detail was already logged during classification.
    return { type: EventType.RUN_ERROR, message: error.message, code: error.code };
  }
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`[AI] ${where} error: ${message}`);
  return { type: EventType.RUN_ERROR, message: LLM_ERROR_MESSAGES.INTERNAL, code: 'INTERNAL' };
}

// Loop guards (OpenHands-style stuck detection, sized down for short chats):
// a given identical call may execute at most twice per run, and a tool that
// fails this many times consecutively is disabled for the rest of the run.
const MAX_IDENTICAL_CALLS = 2;
const CIRCUIT_BREAK_ERRORS = 3;
// If this many consecutive rounds produce tool calls but NONE are executable
// (all deduped / circuit-broken / repeat-capped / invalid), the model is stuck
// in a loop the per-call repair message hasn't broken — stop calling the LLM
// and wrap up instead of spinning to MAX_ITERATIONS.
const MAX_NO_PROGRESS_ROUNDS = 2;

// ---- Service ----------------------------------------------------------------

export class AIAssistantService {
  private client: AxiosInstance | null = null;
  private model = 'qwen/qwen3-v1-30b';
  private enabled = false;
  private apiUrl = '';
  private apiKey = '';
  private abortSignal?: AbortSignal;
  /**
   * Set for a conversation started with an API token: every tool this run
   * offers or executes must be allowed by that token — whoever drives the run.
   */
  private ceiling: ApiTokenPermissions | null = null;
  /** The calling token's approval mode, reported with TOOL_APPROVAL_REQUIRED. */
  private approvalMode: ApprovalMode | null = null;

  async initialize(userId: string): Promise<void> {
    try {
      const db = pool();
      const result = await db.query(
        `SELECT ai_enabled, ai_provider, ai_api_url, ai_api_key, ai_model
         FROM settings WHERE user_id = $1`,
        [userId]
      );

      const settings = result.rows[0];
      if (!settings?.ai_enabled) {
        this.enabled = false;
        return;
      }

      this.enabled = true;
      this.model = settings.ai_model || 'qwen/qwen3-v1-30b';
      const apiUrl = settings.ai_api_url || 'http://localhost:1234/v1';
      const apiKey = settings.ai_api_key || '';
      this.apiUrl = apiUrl;
      this.apiKey = apiKey;

      this.client = axios.create({
        baseURL: apiUrl,
        timeout: 120000,
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
        },
        responseType: 'stream',
      });

      logger.info(`[AI] Assistant initialized for user ${userId} (model: ${this.model})`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[AI] Failed to initialize: ${message}`);
      this.enabled = false;
    }
  }

  async runStream(
    userId: string,
    threadId: string | null,
    userMessage: string,
    userFullName: string,
    userEmail: string,
    language: string,
    bearerToken: string,
    roles: string[],
    emit: EventEmitter,
    signal?: AbortSignal,
    access?: TokenAccess | null
  ): Promise<void> {
    const runId = uuidv4();
    const db = pool();
    this.abortSignal = signal;
    this.approvalMode = access?.approvalMode ?? null;

    // Resolve or create conversation
    let conversationId = threadId;
    let ownedLock: string | null = null;
    if (!conversationId) {
      const result = await db.query(
        `INSERT INTO ai_conversations (user_id, title, api_token_id, started_by_token) VALUES ($1, $2, $3, $4) RETURNING id`,
        [userId, userMessage.slice(0, 100), access?.tokenId ?? null, !!access]
      );
      this.ceiling = access?.permissions ?? null;
      conversationId = result.rows[0].id as string;
      // Existing threads are locked by the controller (HTTP 409 before SSE);
      // a brand-new thread is locked from creation on, so a follow-up request
      // on it (the client learns the id from RUN_STARTED) is refused as well.
      ownedLock = runLockKey(userId, conversationId);
      tryAcquireRunLock(ownedLock);
    } else {
      const found = await this.resolveConversation(conversationId, userId, access);
      if (!found) {
        emit({ type: EventType.RUN_ERROR, message: 'Conversation not found', code: '404' });
        return;
      }
      this.ceiling = found.ceiling;
    }

    try {
      await this.runNewMessage(
        conversationId,
        userMessage,
        userFullName,
        userEmail,
        language,
        bearerToken,
        roles,
        runId,
        emit
      );
    } finally {
      if (ownedLock) releaseRunLock(ownedLock);
    }
  }

  private async runNewMessage(
    conversationId: string,
    userMessage: string,
    userFullName: string,
    userEmail: string,
    language: string,
    bearerToken: string,
    roles: string[],
    runId: string,
    emit: EventEmitter
  ): Promise<void> {
    const db = pool();

    // A new user message supersedes any approval still waiting in this
    // conversation. Persist declined results BEFORE the user message so the
    // stored sequence stays valid and /approve can no longer run stale writes.
    await this.supersedeStaleApprovals(conversationId);

    // Persist user message
    const userRow = await db.query(
      `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'user', $2) RETURNING id`,
      [conversationId, userMessage]
    );

    // userMessageId: the stored turn this run answers (A2A uses it as the task id).
    emit({ type: EventType.RUN_STARTED, threadId: conversationId, runId, userMessageId: userRow.rows[0]?.id });

    if (!this.enabled || !this.client) {
      const msgId = uuidv4();
      emit({ type: EventType.TEXT_MESSAGE_START, messageId: msgId, role: 'assistant' });
      emit({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: msgId,
        delta: 'AI assistant is not enabled. Please configure it in Settings → AI.',
      });
      emit({ type: EventType.TEXT_MESSAGE_END, messageId: msgId });
      await db.query(
        `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`,
        [conversationId, 'AI assistant is not enabled. Please configure it in Settings → AI.']
      );
      emit({ type: EventType.RUN_FINISHED, threadId: conversationId, runId });
      return;
    }

    const history = await loadHistory(conversationId);
    const messages: ConversationMessage[] = [
      { role: 'system', content: buildSystemPrompt(userFullName, userEmail, language) },
      ...history,
    ];

    const tools = await selectTools({
      userMessage,
      roles,
      apiUrl: this.apiUrl,
      apiKey: this.apiKey,
      conversationId,
      permissions: this.ceiling,
    });

    await this.runLoop(conversationId, messages, tools, roles, bearerToken, runId, emit);
  }

  /**
   * Resumes a run that paused for write approval. Executes approved writes
   * (rejected ones are recorded as declined), then continues the loop.
   */
  async resumeRun(
    userId: string,
    conversationId: string,
    approvals: ToolApprovalDecision[],
    userFullName: string,
    userEmail: string,
    language: string,
    bearerToken: string,
    roles: string[],
    emit: EventEmitter,
    signal?: AbortSignal,
    /** Id of the approval batch the client is answering (TOOL_APPROVAL_REQUIRED.batchId). */
    batchId?: string | null,
    access?: TokenAccess | null
  ): Promise<void> {
    const runId = uuidv4();
    const db = pool();
    this.abortSignal = signal;
    this.approvalMode = access?.approvalMode ?? null;

    const found = await this.resolveConversation(conversationId, userId, access);
    if (!found) {
      emit({ type: EventType.RUN_ERROR, message: 'Conversation not found', code: '404' });
      return;
    }
    this.ceiling = found.ceiling;

    emit({ type: EventType.RUN_STARTED, threadId: conversationId, runId });

    if (!this.enabled || !this.client) {
      emit({ type: EventType.RUN_ERROR, message: 'AI assistant is not enabled.', code: 'DISABLED' });
      return;
    }

    // An explicit batchId must name the conversation's CURRENT awaiting batch;
    // anything else (an older card, another tab's stale view) is refused
    // without executing or declining anything. Absent → legacy behaviour.
    const hasBatchId = batchId !== undefined && batchId !== null;
    const staleApproval = () =>
      emit({
        type: EventType.RUN_ERROR,
        message: 'These actions are no longer awaiting approval.',
        code: 'STALE_APPROVAL',
      });
    if (hasBatchId && (typeof batchId !== 'string' || !UUID_RE.test(batchId))) {
      staleApproval();
      return;
    }

    // Atomically CLAIM the newest pending approval (single-use). A plain
    // SELECT-then-UPDATE lets two concurrent /approve requests (double-click,
    // network retry) both read 'awaiting_approval' and execute the writes
    // twice. The status recheck in the outer WHERE makes the second request
    // find zero rows. jsonb_set preserves the pending list for audit.
    const pendingRow = await db.query(
      `UPDATE ai_messages
       SET metadata = jsonb_set(metadata, '{status}', '"resolved"')
       WHERE id = (
         SELECT id FROM ai_messages
         WHERE conversation_id = $1 AND role = 'assistant' AND metadata->>'status' = 'awaiting_approval'
         ORDER BY created_at DESC LIMIT 1
       )
       AND metadata->>'status' = 'awaiting_approval'
       AND ($2::uuid IS NULL OR id = $2::uuid)
       RETURNING id, metadata`,
      [conversationId, hasBatchId ? batchId : null]
    );
    if (pendingRow.rows.length === 0) {
      // AG-UI: an errored run ends with RUN_ERROR only (no RUN_FINISHED after it).
      if (hasBatchId) staleApproval();
      else emit({ type: EventType.RUN_ERROR, message: 'No pending actions to approve.', code: 'NO_PENDING' });
      return;
    }

    const claimedId = pendingRow.rows[0].id as string;
    const pending = (pendingRow.rows[0].metadata?.pending ?? []) as LLMToolCall[];
    const decisions = new Map(approvals.map((a) => [a.toolCallId, a]));
    const processedIds = new Set<string>();

    try {
      // Rebuild context from history. The pending write tool_calls are still
      // legitimately unanswered — exempt them from synthetic-result injection,
      // since real results are appended below.
      const keepDangling = new Set(pending.map((tc) => tc.id));
      const messages: ConversationMessage[] = [
        { role: 'system', content: buildSystemPrompt(userFullName, userEmail, language) },
        ...(await loadHistory(conversationId, keepDangling)),
      ];

      // Apply each pending write decision. Mark each processed BEFORE any
      // side-effecting execution: a write we START must never be re-armed on
      // failure, so a crash mid-write cannot produce a duplicate on retry
      // (at-most-once). Only the untouched tail is re-armed in the catch.
      for (const tc of pending) {
        // Client gone (or stopped): never START another write. The write that
        // was in flight was deliberately not abortable and has completed and
        // been recorded; the untouched tail is re-armed in the catch below so
        // the user can still decide on it after reconnecting.
        if (this.abortSignal?.aborted) throw abortError();
        processedIds.add(tc.id);
        const approval = decisions.get(tc.id);
        const decision = approval?.decision ?? 'reject';
        if (decision === 'approve') {
          // Approve-with-edit: the user corrected the arguments. Validate the
          // edit against the tool schema, execute with the corrected values,
          // and record the edit in the result so model and history stay truthful.
          if (approval?.editedArguments && typeof approval.editedArguments === 'object') {
            const validation = validateToolArguments(tc.function.name, approval.editedArguments);
            if (!validation.ok) {
              const resultContent = JSON.stringify({
                error: `User-edited arguments were invalid (${validation.errors.join('; ')}); the action was NOT executed. Propose the call again if still needed.`,
              });
              emit({ type: EventType.TOOL_CALL_RESULT, toolCallId: tc.id, content: resultContent });
              await this.recordToolResult(tc, conversationId, messages, emit, resultContent);
              continue;
            }
            // Execute a CLONE carrying the edited args — never mutate the shared
            // pending object, so the stored proposal / audit list stays intact.
            const editedCall: LLMToolCall = {
              ...tc,
              function: { ...tc.function, arguments: JSON.stringify(sortKeysDeep(approval.editedArguments)) },
            };
            const outcome = await this.executeCall(editedCall, bearerToken, roles, emit, false);
            const wrapped = JSON.stringify({
              edited_by_user: true,
              executed_arguments: approval.editedArguments,
              result: safeParseArgs(outcome.resultContent),
            });
            await this.recordToolResult(tc, conversationId, messages, emit, wrapped);
          } else {
            await this.executeAndRecord(tc, conversationId, bearerToken, roles, messages, emit);
          }
        } else {
          const resultContent = JSON.stringify({
            declined: true,
            message: 'User declined this action; it was not performed.',
          });
          emit({ type: EventType.TOOL_CALL_RESULT, toolCallId: tc.id, content: resultContent });
          await this.recordToolResult(tc, conversationId, messages, emit, resultContent);
        }
      }

      if (this.abortSignal?.aborted) {
        logger.info('[AI] resumeRun: client gone after the approved actions completed — not continuing');
        return;
      }

      // Re-select tools for the original request, then continue the loop.
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      const tools = await selectTools({
        userMessage: lastUser?.content ?? '',
        roles,
        apiUrl: this.apiUrl,
        apiKey: this.apiKey,
        conversationId,
        // The sticky set was computed when this run started — no need to pay
        // another embedding round trip per approve click.
        reuseSticky: true,
        permissions: this.ceiling,
      });
      await this.runLoop(conversationId, messages, tools, roles, bearerToken, runId, emit);
    } catch (error: unknown) {
      // Recovery: the claim consumed the approval before the work finished.
      // Re-arm ONLY the writes we never started (processedIds is marked before
      // execution → excludes anything with a possible side effect: at-most-once),
      // and ONLY if no newer user message has arrived meanwhile — otherwise that
      // message's supersede should win and we must not resurrect a stale write.
      // The status guard on the UPDATE closes the same race at write time.
      const remaining = pending.filter((tc) => !processedIds.has(tc.id));
      if (remaining.length > 0) {
        try {
          const superseded = await db.query(
            `SELECT 1 FROM ai_messages
             WHERE conversation_id = $1 AND role = 'user'
               AND created_at > (SELECT created_at FROM ai_messages WHERE id = $2)
             LIMIT 1`,
            [conversationId, claimedId]
          );
          if (superseded.rows.length > 0) {
            logger.warn(`[AI] Not re-arming approval ${claimedId}: superseded by a newer user message`);
          } else {
            await db.query(
              `UPDATE ai_messages SET metadata = $1 WHERE id = $2 AND metadata->>'status' = 'resolved'`,
              [JSON.stringify({ status: 'awaiting_approval', pending: remaining }), claimedId]
            );
            logger.warn(`[AI] Re-armed approval ${claimedId} with ${remaining.length} unprocessed action(s) after failure`);
          }
        } catch (rearmErr: unknown) {
          logger.error(`[AI] Failed to re-arm approval ${claimedId}: ${String(rearmErr)}`);
        }
      }

      const event = toRunErrorEvent(error, this.abortSignal, 'resumeRun');
      if (event) emit(event);
    }
  }

  /**
   * Finds the conversation for this caller and the permission ceiling it runs
   * under, or null when the caller may not use it. A token only sees the
   * conversations it started; a conversation started with a token stays
   * within that token's current permissions, whoever continues it.
   */
  private async resolveConversation(
    conversationId: string,
    userId: string,
    access?: TokenAccess | null
  ): Promise<{ ceiling: ApiTokenPermissions | null } | null> {
    const { rows } = await pool().query(
      `SELECT c.api_token_id, c.started_by_token, t.permissions
         FROM ai_conversations c
         LEFT JOIN api_tokens t ON t.id = c.api_token_id
        WHERE c.id = $1 AND c.user_id = $2`,
      [conversationId, userId]
    );
    if (rows.length === 0) return null;
    const startedBy: string | null = rows[0].api_token_id;
    if (access) return startedBy === access.tokenId ? { ceiling: access.permissions } : null;
    if (startedBy) return { ceiling: normalizePermissions(rows[0].permissions) };
    // Started by a token that has since been revoked: no permissions remain.
    return { ceiling: rows[0].started_by_token ? normalizePermissions(null) : null };
  }

  /** Why the ceiling refuses this tool (a message for the model), or null. */
  private ceilingDenial(toolName: string): string | null {
    if (!this.ceiling) return null;
    const missing = toolPermissionDenial(toolName, this.ceiling);
    return missing
      ? `${toolName} is not allowed in this conversation: it runs with an API token that lacks ${missing}. Tell the user which permission is missing instead of retrying.`
      : null;
  }

  /**
   * Supersedes approvals still awaiting a decision in this conversation:
   * persists a declined tool result for each pending write (keeping the stored
   * message sequence API-valid) and flips their status so /approve can no
   * longer execute them.
   */
  /** Declines whatever still awaits approval in this conversation (e.g. a cancelled A2A task). */
  async declinePendingApprovals(conversationId: string): Promise<void> {
    await this.supersedeStaleApprovals(conversationId);
  }

  private async supersedeStaleApprovals(conversationId: string): Promise<void> {
    const db = pool();
    const stale = await db.query(
      `SELECT id FROM ai_messages
       WHERE conversation_id = $1 AND role = 'assistant' AND metadata->>'status' = 'awaiting_approval'`,
      [conversationId]
    );

    for (const row of stale.rows) {
      // Atomically CLAIM the row first — a concurrent /approve that wins the
      // race keeps its real results and we skip ours, so a tool_call_id can
      // never receive both an executed and a 'superseded' result. jsonb_set
      // preserves the pending list for audit.
      const claimed = await db.query(
        `UPDATE ai_messages
         SET metadata = jsonb_set(metadata, '{status}', '"superseded"')
         WHERE id = $1 AND metadata->>'status' = 'awaiting_approval'
         RETURNING metadata`,
        [row.id]
      );
      if (claimed.rows.length === 0) continue; // lost the race to /approve

      const pending = (claimed.rows[0].metadata?.pending ?? []) as LLMToolCall[];
      for (const tc of pending) {
        await db.query(
          `INSERT INTO ai_messages (conversation_id, role, content, tool_call_id, tool_name)
           VALUES ($1, 'tool', $2, $3, $4)`,
          [
            conversationId,
            JSON.stringify({
              declined: true,
              message: 'Not executed — superseded by a new user message before approval.',
            }),
            tc.id,
            tc.function.name,
          ]
        );
      }
      logger.info(`[AI] Superseded stale approval ${row.id} (${pending.length} pending action(s))`);
    }
  }

  /**
   * Runs the tool-calling loop until the model produces a final answer, the
   * iteration budget is exhausted, or write tool calls require approval — in
   * which case the run pauses (emits TOOL_APPROVAL_REQUIRED) and returns.
   */
  private async runLoop(
    conversationId: string,
    messages: ConversationMessage[],
    tools: LLMTool[],
    roles: string[],
    bearerToken: string,
    runId: string,
    emit: EventEmitter
  ): Promise<void> {
    const db = pool();

    // Per-run guards: repeat-call counts, per-tool error streaks, disabled tools.
    const seenCallCounts = new Map<string, number>();
    const errorStreaks = new Map<string, number>();
    const disabledTools = new Set<string>();
    let activeTools = tools;
    let noProgressRounds = 0;

    try {
      let finalized = false;

      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        if (this.abortSignal?.aborted) throw abortError();
        const { content, toolCalls, finishReason } = await this.callLLM(messages, activeTools, emit);

        // Output hit the token cap mid-tool-call: the argument JSON is
        // untrustworthy — discard the partial calls and ask for a leaner retry.
        if (finishReason === 'length' && toolCalls.length > 0) {
          logger.warn('[AI] Output truncated mid-tool-call — discarding partial calls');
          if (content) {
            await db.query(
              `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`,
              [conversationId, content]
            );
            messages.push({ role: 'assistant', content });
          }
          messages.push({
            role: 'system',
            content:
              'Your previous reply was cut off by the output token limit before the tool calls completed. Continue more concisely: issue fewer or smaller tool calls, or give a shorter answer.',
          });
          continue;
        }

        if (toolCalls.length === 0) {
          // An all-reasoning reply strips to '' — fall through to the tool-free
          // wrap-up instead of persisting an empty assistant message.
          if (!content) {
            logger.warn('[AI] Final response was empty after think-stripping — forcing wrap-up');
            break;
          }
          // Final response — persist and finish (flag a truncated answer).
          const finalText =
            finishReason === 'length' ? `${content}\n\n[Reply truncated by the output token limit]` : content;
          await db.query(
            `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`,
            [conversationId, finalText]
          );
          finalized = true;
          break;
        }

        // Stuck detection is handled by ONE mechanism: the per-call repeat guard
        // below (identical call executes at most twice, then gets a corrective
        // synthetic result). The old whole-batch signature break was removed —
        // it fired first and silently ended the run before the model ever saw
        // the repair message; MAX_ITERATIONS remains the hard stop.

        // Parse and CANONICALIZE every call BEFORE anything is persisted:
        // the stored history, the in-memory context, dedupe keys, the approval
        // card, the pending list and execution must all see one canonical
        // single-encoded form (double-stringified args are unwound here).
        // Unparseable arguments are stored as '{}' — replaying the raw broken
        // JSON would make strict servers reject the whole history — while the
        // dedupe identity keeps the raw text so a malformed call never shares a
        // key with a valid empty-args call. Duplicate/missing ids get fresh ones
        // (each id must receive exactly one tool result).
        const seenIds = new Set<string>();
        const prepared = toolCalls.map((raw) => {
          const parsedArgs = parseToolArguments(raw.function.arguments);
          const id = raw.id && !seenIds.has(raw.id) ? raw.id : uuidv4();
          seenIds.add(id);
          const tc: LLMToolCall = {
            id,
            type: 'function',
            function: {
              name: raw.function.name,
              arguments: parsedArgs.ok ? JSON.stringify(sortKeysDeep(parsedArgs.args)) : '{}',
            },
          };
          return { tc, parsedArgs, rawArgs: raw.function.arguments };
        });
        const cleanCalls = prepared.map((p) => p.tc);

        // Persist assistant message with tool_calls (capture id for approval metadata).
        const inserted = await db.query(
          `INSERT INTO ai_messages (conversation_id, role, content, tool_calls) VALUES ($1, 'assistant', $2, $3) RETURNING id`,
          [conversationId, content || null, JSON.stringify(cleanCalls)]
        );
        const assistantMsgId = inserted.rows[0].id as string;

        messages.push({ role: 'assistant', content: content || null, tool_calls: cleanCalls });

        // Partition the batch: duplicates within one response (documented local-
        // server bug), calls to circuit-broken tools, and identical calls already
        // executed MAX_IDENTICAL_CALLS times all get synthetic results; the rest
        // execute (reads) or go to approval (writes).
        const batchSeen = new Set<string>();
        const executable: LLMToolCall[] = [];
        for (const { tc, parsedArgs, rawArgs } of prepared) {
          const key = parsedArgs.ok
            ? `${tc.function.name}::${tc.function.arguments}`
            : `${tc.function.name}::RAW::${rawArgs}`;

          if (batchSeen.has(key)) {
            await this.recordSyntheticResult(tc, conversationId, messages, emit, {
              skipped: true,
              reason: 'Duplicate of another tool call in the same response; it executes only once.',
            });
            continue;
          }
          batchSeen.add(key);

          if (disabledTools.has(tc.function.name)) {
            await this.recordSyntheticResult(tc, conversationId, messages, emit, {
              error: `Tool ${tc.function.name} is disabled for the rest of this run after repeated failures. Use a different tool or give your final answer.`,
            });
            continue;
          }

          const timesSeen = (seenCallCounts.get(key) ?? 0) + 1;
          seenCallCounts.set(key, timesSeen);
          if (timesSeen > MAX_IDENTICAL_CALLS) {
            await this.recordSyntheticResult(tc, conversationId, messages, emit, {
              error: `You already called ${tc.function.name} with these exact arguments ${MAX_IDENTICAL_CALLS} times — the result will not change. Take a different approach or give your final answer.`,
            });
            continue;
          }

          if (!parsedArgs.ok) {
            await this.recordSyntheticResult(tc, conversationId, messages, emit, {
              error: `Invalid tool arguments (${parsedArgs.error}). Re-send this call with the arguments as one valid JSON object matching the tool schema.`,
            });
            continue;
          }

          // Schema validation BEFORE execution or approval: field-path repair
          // messages fix most local-model format errors in one retry, and
          // invalid writes never reach the approval card.
          const validation = validateToolArguments(tc.function.name, parsedArgs.args);
          if (!validation.ok) {
            await this.recordSyntheticResult(tc, conversationId, messages, emit, {
              error: `Invalid arguments for ${tc.function.name}: ${validation.errors.join('; ')}. Fix these parameters and call the tool again.`,
            });
            continue;
          }

          // Token conversations: a disallowed write never reaches the approval card.
          const denied = this.ceilingDenial(tc.function.name);
          if (denied) {
            await this.recordSyntheticResult(tc, conversationId, messages, emit, { error: denied });
            continue;
          }

          executable.push(tc);
        }

        // No-forward-progress break: every call this round was suppressed with a
        // synthetic result (the model keeps repeating suppressed calls). The
        // synthetic feedback is already in `messages`; give it a couple of rounds
        // to react, then stop rather than burning LLM calls up to MAX_ITERATIONS.
        if (executable.length === 0) {
          if (++noProgressRounds >= MAX_NO_PROGRESS_ROUNDS) {
            logger.warn('[AI] No executable tool calls for consecutive rounds — breaking to wrap-up');
            break;
          }
          continue;
        }
        noProgressRounds = 0;

        // Split into reads (auto-run) and writes (require approval).
        const writes = executable.filter((tc) => isWriteTool(tc.function.name));
        const reads = executable.filter((tc) => !isWriteTool(tc.function.name));

        // Execute all reads in parallel, but PERSIST results sequentially in the
        // original tool-call order — completion-order persistence makes next
        // turn's loaded history diverge from the prompt prefix the model just
        // saw, silently defeating the KV-cache stability machinery.
        const readOutcomes = await Promise.all(
          reads.map((tc) => this.executeCall(tc, bearerToken, roles, emit).then((r) => ({ tc, ...r })))
        );
        for (const { tc, resultContent } of readOutcomes) {
          await this.recordToolResult(tc, conversationId, messages, emit, resultContent);
        }

        // Per-tool circuit breaker. Only infrastructure failures count (5xx /
        // transport errors) — 4xx are model-input errors the model can repair —
        // and one model response increments a tool's streak at most once, so a
        // single batch of parallel failures can't exhaust the breaker.
        const failedTools = new Set<string>();
        const succeededTools = new Set<string>();
        for (const { tc, isInfraError } of readOutcomes) {
          (isInfraError ? failedTools : succeededTools).add(tc.function.name);
        }
        for (const name of succeededTools) errorStreaks.set(name, 0);
        for (const name of failedTools) {
          if (succeededTools.has(name)) continue; // mixed outcome — not a broken tool
          const streak = (errorStreaks.get(name) ?? 0) + 1;
          errorStreaks.set(name, streak);
          if (streak >= CIRCUIT_BREAK_ERRORS && !disabledTools.has(name)) {
            disabledTools.add(name);
            activeTools = activeTools.filter((t) => t.function.name !== name);
            logger.warn(`[AI] Circuit breaker: disabled ${name} after ${streak} consecutive failing rounds`);
          }
        }

        // Pre-approval resolution (e.g. log_time_entry resolves the project
        // name to the exact project + id): the card shows what will actually be
        // written, and a refused call (ambiguous/unknown) goes back to the model
        // as a tool result instead of reaching the card.
        const approvable = await this.prepareWrites(writes, bearerToken, conversationId, messages, emit);

        // If the model proposed any writes, pause for human approval and end the run.
        if (approvable.length > 0) {
          await db.query(`UPDATE ai_messages SET metadata = $1 WHERE id = $2`, [
            JSON.stringify({ status: 'awaiting_approval', pending: approvable }),
            assistantMsgId,
          ]);
          emit({
            type: EventType.TOOL_APPROVAL_REQUIRED,
            threadId: conversationId,
            runId,
            // The approval batch = the assistant message holding the pending
            // actions; /approve may echo it back to refuse stale decisions.
            batchId: assistantMsgId,
            planText: content || '',
            // 'in_app': the token's owner approves in the OpenTyme web app; the
            // calling client cannot (POST /approve answers 403) and should poll
            // the conversation instead.
            ...(this.approvalMode ? { approvalMode: this.approvalMode } : {}),
            actions: approvable.map((tc) => ({
              toolCallId: tc.id,
              toolName: tc.function.name,
              arguments: safeParseArgs(tc.function.arguments),
            })),
          });
          await db.query(`UPDATE ai_conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
          emit({ type: EventType.RUN_FINISHED, threadId: conversationId, runId });
          return;
        }
      }

      // If the loop ended without a natural-language answer (iteration cap reached or
      // no-progress break), force one tool-free call so the user always gets a reply.
      if (!finalized) {
        const wrapUp = await this.callLLM(messages, [], emit, 'none');
        const finalText =
          wrapUp.content ||
          'I reached the step limit before fully finishing. Here is what I completed so far — let me know if you want me to continue.';
        await db.query(
          `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`,
          [conversationId, finalText]
        );
      }

      // Update conversation updated_at
      await db.query(`UPDATE ai_conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);

      emit({ type: EventType.RUN_FINISHED, threadId: conversationId, runId });
    } catch (error: unknown) {
      const event = toRunErrorEvent(error, this.abortSignal, 'runLoop');
      if (event) emit(event);
    }
  }

  /**
   * Runs the optional `prepare` step of custom write tools before the approval
   * pause. Returns the calls to put on the approval card (with the reviewed
   * arguments); refused calls get their error recorded as the tool result.
   * The assistant message keeps the model's original arguments — the pending
   * list (what executes after approval) carries the prepared ones.
   */
  private async prepareWrites(
    writes: LLMToolCall[],
    bearerToken: string,
    conversationId: string,
    messages: ConversationMessage[],
    emit: EventEmitter
  ): Promise<LLMToolCall[]> {
    const approvable: LLMToolCall[] = [];
    for (const tc of writes) {
      const custom = getCustomToolByName(tc.function.name);
      if (!custom?.prepare) {
        approvable.push(tc);
        continue;
      }
      try {
        const reviewed = await custom.prepare(safeParseArgs(tc.function.arguments), { bearerToken });
        approvable.push({ ...tc, function: { ...tc.function, arguments: JSON.stringify(sortKeysDeep(reviewed)) } });
      } catch (err: unknown) {
        logger.info(`[AI] ${tc.function.name} refused before approval (returned to the model)`);
        await this.recordSyntheticResult(tc, conversationId, messages, emit, {
          error: `${tc.function.name} was not proposed: ${safeToolErrorMessage(err)}`,
        });
      }
    }
    return approvable;
  }

  /**
   * Executes a single tool call and emits its lifecycle events — persistence is
   * separate (recordToolResult) so parallel execution can persist in a
   * deterministic order. Malformed arguments are NOT executed — the model gets
   * a precise repair message (isInfraError=false: model-side, not tool-side).
   */
  private async executeCall(
    tc: LLMToolCall,
    bearerToken: string,
    roles: string[],
    emit: EventEmitter,
    /**
     * Approved writes pass false: a write already in flight must never be
     * cancelled by a client disconnect — an aborted request that actually
     * succeeded server-side would be recorded as failed and proposed again.
     */
    abortable = true
  ): Promise<{ resultContent: string; isError: boolean; isInfraError: boolean }> {
    const tcId = tc.id;
    const tcName = tc.function.name;

    emit({ type: EventType.TOOL_CALL_START, toolCallId: tcId, toolCallName: tcName });
    emit({ type: EventType.TOOL_CALL_ARGS, toolCallId: tcId, delta: tc.function.arguments || '{}' });
    emit({ type: EventType.TOOL_CALL_END, toolCallId: tcId });

    let resultContent: string;
    let isError = false;
    let isInfraError = false;
    const parsed = parseToolArguments(tc.function.arguments);
    // Checked again here: an approved write executes later, and the token's
    // permissions may have been narrowed in the meantime.
    const denied = this.ceilingDenial(tcName);
    if (denied) {
      isError = true;
      resultContent = JSON.stringify({ error: denied });
    } else if (!parsed.ok) {
      resultContent = JSON.stringify({
        error: `Invalid tool arguments (${parsed.error}). Re-send this call with the arguments as one valid JSON object matching the tool schema.`,
      });
    } else {
      try {
        const result = await executeToolCall(
          tcName,
          parsed.args,
          bearerToken,
          roles,
          abortable ? this.abortSignal : undefined
        );
        isError = result.status >= 400 || result.error !== undefined;
        isInfraError = result.status >= 500 || result.error !== undefined;
        // Explicit error envelope: a bare 4xx body like {"message":"Not found"}
        // looks structurally identical to success data to the model — mark
        // failures unambiguously so it never mistakes an error for a result.
        resultContent = isError
          ? JSON.stringify({ error: true, http_status: result.status, body: result.data ?? result.error ?? '' })
          : JSON.stringify(result.data ?? '');
      } catch (toolErr: unknown) {
        const msg = toolErr instanceof Error ? toolErr.message : String(toolErr);
        isError = true;
        isInfraError = true;
        resultContent = JSON.stringify({ error: `Tool execution failed: ${msg}` });
      }
    }

    emit({ type: EventType.TOOL_CALL_RESULT, toolCallId: tcId, content: resultContent.slice(0, 8000) });
    return { resultContent, isError, isInfraError };
  }

  /** Persists a tool result and appends it to the in-memory message list. */
  private async recordToolResult(
    tc: LLMToolCall,
    conversationId: string,
    messages: ConversationMessage[],
    _emit: EventEmitter,
    resultContent: string
  ): Promise<void> {
    const db = pool();
    await db.query(
      `INSERT INTO ai_messages (conversation_id, role, content, tool_call_id, tool_name)
       VALUES ($1, 'tool', $2, $3, $4)`,
      [conversationId, resultContent, tc.id, tc.function.name]
    );
    messages.push({ role: 'tool', content: resultContent, tool_call_id: tc.id, name: tc.function.name });
  }

  /** Executes one tool call and immediately persists its result (resume path). */
  private async executeAndRecord(
    tc: LLMToolCall,
    conversationId: string,
    bearerToken: string,
    roles: string[],
    messages: ConversationMessage[],
    emit: EventEmitter
  ): Promise<{ isError: boolean }> {
    // Resume path = approved writes: not abortable (see executeCall).
    const outcome = await this.executeCall(tc, bearerToken, roles, emit, false);
    await this.recordToolResult(tc, conversationId, messages, emit, outcome.resultContent);
    return { isError: outcome.isError };
  }

  /**
   * Answers a tool call WITHOUT executing it (duplicate, repeat, or disabled
   * tool), keeping both the AG-UI timeline and the stored message sequence
   * valid — every tool_call id must receive a tool result.
   */
  private async recordSyntheticResult(
    tc: LLMToolCall,
    conversationId: string,
    messages: ConversationMessage[],
    emit: EventEmitter,
    payload: Record<string, unknown>
  ): Promise<void> {
    const db = pool();
    const resultContent = JSON.stringify(payload);
    emit({ type: EventType.TOOL_CALL_START, toolCallId: tc.id, toolCallName: tc.function.name });
    emit({ type: EventType.TOOL_CALL_ARGS, toolCallId: tc.id, delta: tc.function.arguments || '{}' });
    emit({ type: EventType.TOOL_CALL_END, toolCallId: tc.id });
    emit({ type: EventType.TOOL_CALL_RESULT, toolCallId: tc.id, content: resultContent });
    await db.query(
      `INSERT INTO ai_messages (conversation_id, role, content, tool_call_id, tool_name)
       VALUES ($1, 'tool', $2, $3, $4)`,
      [conversationId, resultContent, tc.id, tc.function.name]
    );
    messages.push({ role: 'tool', content: resultContent, tool_call_id: tc.id, name: tc.function.name });
  }

  /** Streams one chat-completion round via the shared LLM client. */
  private callLLM(
    messages: ConversationMessage[],
    tools: LLMTool[],
    emit: EventEmitter,
    toolChoice: 'auto' | 'none' = 'auto'
  ): ReturnType<typeof streamChatCompletion> {
    return streamChatCompletion({
      client: this.client!,
      model: this.model,
      messages,
      tools,
      emit,
      toolChoice,
      signal: this.abortSignal,
    });
  }
}

export const aiAssistantService = new AIAssistantService();
