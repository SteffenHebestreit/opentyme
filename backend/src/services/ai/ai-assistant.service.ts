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
import { streamChatCompletion } from './llm-stream.service';
import { safeParseArgs, sortKeysDeep, parseToolArguments } from './tool-call-utils';
import { buildSystemPrompt } from './system-prompt.builder';
import { LLMTool, validateToolArguments } from './openapi-tool-builder.service';
import { selectTools } from './tool-selection.service';
import { executeToolCall, isWriteTool } from './tool-executor.service';

// Re-exported for existing importers (controller, A2A adapter).
export type { EventEmitter } from './ai-events';
export type { ConversationMessage } from './conversation-history.service';

export interface ToolApprovalDecision {
  toolCallId: string;
  decision: 'approve' | 'reject';
  /** Approve-with-edit: corrected arguments to execute instead of the proposed ones. */
  editedArguments?: Record<string, unknown>;
}

const MAX_ITERATIONS = Number(process.env.AI_MAX_ITERATIONS) || 12;

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
    signal?: AbortSignal
  ): Promise<void> {
    const runId = uuidv4();
    const db = pool();
    this.abortSignal = signal;

    // Resolve or create conversation
    let conversationId = threadId;
    if (!conversationId) {
      const result = await db.query(
        `INSERT INTO ai_conversations (user_id, title) VALUES ($1, $2) RETURNING id`,
        [userId, userMessage.slice(0, 100)]
      );
      conversationId = result.rows[0].id as string;
    } else {
      // Verify ownership
      const check = await db.query(
        `SELECT id FROM ai_conversations WHERE id = $1 AND user_id = $2`,
        [conversationId, userId]
      );
      if (check.rows.length === 0) {
        emit({ type: EventType.RUN_ERROR, message: 'Conversation not found', code: '404' });
        return;
      }
    }

    // A new user message supersedes any approval still waiting in this
    // conversation. Persist declined results BEFORE the user message so the
    // stored sequence stays valid and /approve can no longer run stale writes.
    await this.supersedeStaleApprovals(conversationId);

    // Persist user message
    await db.query(
      `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
      [conversationId, userMessage]
    );

    emit({ type: EventType.RUN_STARTED, threadId: conversationId, runId });

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
    signal?: AbortSignal
  ): Promise<void> {
    const runId = uuidv4();
    const db = pool();
    this.abortSignal = signal;

    const conv = await db.query(`SELECT id FROM ai_conversations WHERE id = $1 AND user_id = $2`, [
      conversationId,
      userId,
    ]);
    if (conv.rows.length === 0) {
      emit({ type: EventType.RUN_ERROR, message: 'Conversation not found', code: '404' });
      return;
    }

    emit({ type: EventType.RUN_STARTED, threadId: conversationId, runId });

    if (!this.enabled || !this.client) {
      emit({ type: EventType.RUN_ERROR, message: 'AI assistant is not enabled.', code: 'DISABLED' });
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
       RETURNING id, metadata`,
      [conversationId]
    );
    if (pendingRow.rows.length === 0) {
      emit({ type: EventType.RUN_ERROR, message: 'No pending actions to approve.', code: 'NO_PENDING' });
      emit({ type: EventType.RUN_FINISHED, threadId: conversationId, runId });
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
            const outcome = await this.executeCall(editedCall, bearerToken, roles, emit);
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
      });
      await this.runLoop(conversationId, messages, tools, roles, bearerToken, runId, emit);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[AI] resumeRun error: ${message}`);

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

      emit({ type: EventType.RUN_ERROR, message, code: 'INTERNAL' });
    }
  }

  /**
   * Supersedes approvals still awaiting a decision in this conversation:
   * persists a declined tool result for each pending write (keeping the stored
   * message sequence API-valid) and flips their status so /approve can no
   * longer execute them.
   */
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

        // Persist assistant message with tool_calls (capture id for approval metadata).
        const inserted = await db.query(
          `INSERT INTO ai_messages (conversation_id, role, content, tool_calls) VALUES ($1, 'assistant', $2, $3) RETURNING id`,
          [conversationId, content || null, JSON.stringify(toolCalls)]
        );
        const assistantMsgId = inserted.rows[0].id as string;

        messages.push({ role: 'assistant', content: content || null, tool_calls: toolCalls });

        // Partition the batch: duplicates within one response (documented local-
        // server bug), calls to circuit-broken tools, and identical calls already
        // executed MAX_IDENTICAL_CALLS times all get synthetic results; the rest
        // execute (reads) or go to approval (writes).
        const batchSeen = new Set<string>();
        const executable: LLMToolCall[] = [];
        for (const tc of toolCalls) {
          // Parse and CANONICALIZE first: everything downstream — dedupe keys,
          // the approval card, the persisted pending list, and execution — must
          // see one canonical single-encoded form (double-stringified args are
          // unwound here), and malformed args must not share an identity key
          // with valid empty-args calls.
          const parsedArgs = parseToolArguments(tc.function.arguments);
          if (parsedArgs.ok) {
            tc.function.arguments = JSON.stringify(sortKeysDeep(parsedArgs.args));
          }
          const key = parsedArgs.ok
            ? `${tc.function.name}::${tc.function.arguments}`
            : `${tc.function.name}::RAW::${tc.function.arguments}`;

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

        // If the model proposed any writes, pause for human approval and end the run.
        if (writes.length > 0) {
          await db.query(`UPDATE ai_messages SET metadata = $1 WHERE id = $2`, [
            JSON.stringify({ status: 'awaiting_approval', pending: writes }),
            assistantMsgId,
          ]);
          emit({
            type: EventType.TOOL_APPROVAL_REQUIRED,
            threadId: conversationId,
            runId,
            planText: content || '',
            actions: writes.map((tc) => ({
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
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[AI] runLoop error: ${message}`);
      emit({ type: EventType.RUN_ERROR, message, code: 'INTERNAL' });
    }
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
    emit: EventEmitter
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
    if (!parsed.ok) {
      resultContent = JSON.stringify({
        error: `Invalid tool arguments (${parsed.error}). Re-send this call with the arguments as one valid JSON object matching the tool schema.`,
      });
    } else {
      try {
        const result = await executeToolCall(tcName, parsed.args, bearerToken, roles, this.abortSignal);
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
    const outcome = await this.executeCall(tc, bearerToken, roles, emit);
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
