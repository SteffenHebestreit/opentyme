/**
 * Core AI Assistant orchestration service.
 * Streams AG-UI protocol events back to the caller via the emitEvent callback.
 * Uses the user's Bearer token for all tool calls → enforces user-level authorization.
 *
 * Write tool calls (create/update/delete) are never executed automatically: the
 * run pauses and emits TOOL_APPROVAL_REQUIRED, then resumeRun() continues once the
 * user approves or rejects the proposed actions.
 */

import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';

// AG-UI event type constants (local — avoids @ag-ui/core ESM bundling issues)
const EventType = {
  RUN_STARTED: 'RUN_STARTED',
  RUN_FINISHED: 'RUN_FINISHED',
  RUN_ERROR: 'RUN_ERROR',
  TEXT_MESSAGE_START: 'TEXT_MESSAGE_START',
  TEXT_MESSAGE_CONTENT: 'TEXT_MESSAGE_CONTENT',
  TEXT_MESSAGE_END: 'TEXT_MESSAGE_END',
  TOOL_CALL_START: 'TOOL_CALL_START',
  TOOL_CALL_ARGS: 'TOOL_CALL_ARGS',
  TOOL_CALL_END: 'TOOL_CALL_END',
  TOOL_CALL_RESULT: 'TOOL_CALL_RESULT',
  TOOL_APPROVAL_REQUIRED: 'TOOL_APPROVAL_REQUIRED',
} as const;
import { logger } from '../../utils/logger';
import { pool } from '../../utils/database';
import { LLMTool } from './openapi-tool-builder.service';
import { selectTools } from './tool-selection.service';
import { executeToolCall, isWriteTool } from './tool-executor.service';
import { buildSystemPromptExtensions } from './system-prompt-registry.service';

// ---- Types ----------------------------------------------------------------

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string | null;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface LLMStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string;
  }>;
}

export interface ToolApprovalDecision {
  toolCallId: string;
  decision: 'approve' | 'reject';
}

// AG-UI emitter callback – caller passes res.write binding
export type EventEmitter = (event: Record<string, unknown>) => void;

// Number of most-recent messages to load as context for each run.
const HISTORY_LIMIT = Number(process.env.AI_HISTORY_LIMIT) || 40;
const MAX_ITERATIONS = Number(process.env.AI_MAX_ITERATIONS) || 12;
// Max cumulative characters of tool-result content sent to the model per call.
const TOOL_CONTEXT_BUDGET = Number(process.env.AI_TOOL_CONTEXT_BUDGET) || 24000;

/**
 * Ensures the loaded history window is valid for the chat-completions API:
 * every `tool` message must follow an assistant message (within the window)
 * that introduced its tool_call_id. Drops orphan tool results left at the
 * front of the window when their originating assistant message was trimmed off.
 */
function sanitizeHistoryWindow(messages: ConversationMessage[]): ConversationMessage[] {
  const knownToolCallIds = new Set<string>();
  const result: ConversationMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) knownToolCallIds.add(tc.id);
    }
    if (msg.role === 'tool' && (!msg.tool_call_id || !knownToolCallIds.has(msg.tool_call_id))) {
      continue; // orphan tool result — drop it
    }
    result.push(msg);
  }
  return result;
}

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

/**
 * Returns a copy of the messages with older tool-result contents truncated so the
 * cumulative tool context stays within budget. Keeps the most recent results intact
 * and never drops messages (preserves assistant/tool pairing).
 */
function applyToolContextBudget(messages: ConversationMessage[]): ConversationMessage[] {
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

    const history = await this.loadHistory(conversationId);
    const messages: ConversationMessage[] = [
      { role: 'system', content: this.buildSystemPrompt(userFullName, userEmail, language) },
      ...history,
    ];

    const tools = await selectTools({
      userMessage,
      roles,
      apiUrl: this.apiUrl,
      apiKey: this.apiKey,
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

    // Find the pending approval (single-use).
    const pendingRow = await db.query(
      `SELECT id, metadata FROM ai_messages
       WHERE conversation_id = $1 AND role = 'assistant' AND metadata->>'status' = 'awaiting_approval'
       ORDER BY created_at DESC LIMIT 1`,
      [conversationId]
    );
    if (pendingRow.rows.length === 0) {
      emit({ type: EventType.RUN_ERROR, message: 'No pending actions to approve.', code: 'NO_PENDING' });
      emit({ type: EventType.RUN_FINISHED, threadId: conversationId, runId });
      return;
    }

    const assistantMsgId = pendingRow.rows[0].id as string;
    const pending = (pendingRow.rows[0].metadata?.pending ?? []) as LLMToolCall[];
    const decisions = new Map(approvals.map((a) => [a.toolCallId, a.decision]));

    try {
      // Rebuild context from history (includes the assistant tool_calls + read results).
      const messages: ConversationMessage[] = [
        { role: 'system', content: this.buildSystemPrompt(userFullName, userEmail, language) },
        ...(await this.loadHistory(conversationId)),
      ];

      // Apply each pending write decision.
      for (const tc of pending) {
        const decision = decisions.get(tc.id) ?? 'reject';
        if (decision === 'approve') {
          await this.executeAndRecord(tc, conversationId, bearerToken, roles, messages, emit);
        } else {
          const resultContent = JSON.stringify({
            declined: true,
            message: 'User declined this action; it was not performed.',
          });
          emit({ type: EventType.TOOL_CALL_RESULT, toolCallId: tc.id, content: resultContent });
          await db.query(
            `INSERT INTO ai_messages (conversation_id, role, content, tool_call_id, tool_name)
             VALUES ($1, 'tool', $2, $3, $4)`,
            [conversationId, resultContent, tc.id, tc.function.name]
          );
          messages.push({ role: 'tool', content: resultContent, tool_call_id: tc.id, name: tc.function.name });
        }
      }

      // Mark the approval resolved (single-use).
      await db.query(`UPDATE ai_messages SET metadata = $1 WHERE id = $2`, [
        JSON.stringify({ status: 'resolved' }),
        assistantMsgId,
      ]);

      // Re-select tools for the original request, then continue the loop.
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      const tools = await selectTools({
        userMessage: lastUser?.content ?? '',
        roles,
        apiUrl: this.apiUrl,
        apiKey: this.apiKey,
      });
      await this.runLoop(conversationId, messages, tools, roles, bearerToken, runId, emit);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[AI] resumeRun error: ${message}`);
      emit({ type: EventType.RUN_ERROR, message, code: 'INTERNAL' });
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

    try {
      let finalized = false;
      let lastSignature = '';

      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const { content, toolCalls } = await this.callLLM(messages, tools, conversationId, emit);

        if (toolCalls.length === 0) {
          // Final response — persist and finish
          await db.query(
            `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`,
            [conversationId, content]
          );
          finalized = true;
          break;
        }

        // No-progress guard: identical tool-call batch two iterations in a row → stop looping.
        const signature = JSON.stringify(toolCalls.map((tc) => [tc.function.name, tc.function.arguments]));
        if (signature === lastSignature) {
          logger.warn('[AI] No-progress loop detected — breaking out of tool loop');
          break;
        }
        lastSignature = signature;

        // Persist assistant message with tool_calls (capture id for approval metadata).
        const inserted = await db.query(
          `INSERT INTO ai_messages (conversation_id, role, content, tool_calls) VALUES ($1, 'assistant', $2, $3) RETURNING id`,
          [conversationId, content || null, JSON.stringify(toolCalls)]
        );
        const assistantMsgId = inserted.rows[0].id as string;

        messages.push({ role: 'assistant', content: content || null, tool_calls: toolCalls });

        // Split into reads (auto-run) and writes (require approval).
        const writes = toolCalls.filter((tc) => isWriteTool(tc.function.name));
        const reads = toolCalls.filter((tc) => !isWriteTool(tc.function.name));

        // Auto-run all reads first (in parallel — they have no inter-dependencies).
        await Promise.all(
          reads.map((tc) => this.executeAndRecord(tc, conversationId, bearerToken, roles, messages, emit))
        );

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
        const wrapUp = await this.callLLM(messages, [], conversationId, emit, 'none');
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

  /** Executes a single tool call: emits lifecycle events, runs it, persists + appends the result. */
  private async executeAndRecord(
    tc: LLMToolCall,
    conversationId: string,
    bearerToken: string,
    roles: string[],
    messages: ConversationMessage[],
    emit: EventEmitter
  ): Promise<void> {
    const db = pool();
    const tcId = tc.id;
    const tcName = tc.function.name;
    const argsObj = safeParseArgs(tc.function.arguments);

    emit({ type: EventType.TOOL_CALL_START, toolCallId: tcId, toolCallName: tcName });
    emit({ type: EventType.TOOL_CALL_ARGS, toolCallId: tcId, delta: tc.function.arguments || '{}' });
    emit({ type: EventType.TOOL_CALL_END, toolCallId: tcId });

    let resultContent: string;
    try {
      const result = await executeToolCall(tcName, argsObj, bearerToken, roles, this.abortSignal);
      resultContent = JSON.stringify(result.data ?? result.error ?? '');
    } catch (toolErr: unknown) {
      const msg = toolErr instanceof Error ? toolErr.message : String(toolErr);
      resultContent = JSON.stringify({ error: `Tool execution failed: ${msg}` });
    }

    emit({ type: EventType.TOOL_CALL_RESULT, toolCallId: tcId, content: resultContent.slice(0, 8000) });

    await db.query(
      `INSERT INTO ai_messages (conversation_id, role, content, tool_call_id, tool_name)
       VALUES ($1, 'tool', $2, $3, $4)`,
      [conversationId, resultContent, tcId, tcName]
    );
    messages.push({ role: 'tool', content: resultContent, tool_call_id: tcId, name: tcName });
  }

  /** Loads the most-recent N messages for a conversation in chronological, API-valid order. */
  private async loadHistory(conversationId: string): Promise<ConversationMessage[]> {
    const db = pool();
    const result = await db.query(
      `SELECT role, content, tool_calls, tool_call_id, tool_name
       FROM ai_messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [conversationId, HISTORY_LIMIT]
    );
    return sanitizeHistoryWindow(
      result.rows.reverse().map((row) => ({
        role: row.role as ConversationMessage['role'],
        content: row.content,
        ...(row.tool_calls ? { tool_calls: row.tool_calls } : {}),
        ...(row.tool_call_id ? { tool_call_id: row.tool_call_id } : {}),
        ...(row.tool_name ? { name: row.tool_name } : {}),
      }))
    );
  }

  private buildSystemPrompt(userFullName: string, userEmail: string, language: string): string {
    const today = new Date().toISOString().split('T')[0];
    return `You are the AI assistant for OpenTYME, a time tracking and invoicing application for freelancers and small businesses.
Today is ${today}. User: ${userFullName} (${userEmail}).
You have tools that call the application REST API on the user's behalf.
Always fetch real data rather than guessing. Summarize results concisely and helpfully.
When creating or modifying data, confirm what was done.
Always respond in the user's preferred language: ${language}.

CRITICAL — follow user-provided values exactly:
- When the user specifies dates, times, descriptions, task names, or any other values, use them EXACTLY as given. NEVER substitute, invent, or change user-provided values.
- If the user says "today", use ${today}. If the user says a specific date, use that exact date.
- If the user provides specific start/end times, use those exact times — do NOT change them.
- If the user corrects you, re-read their original request carefully and use the correct values. Do NOT repeat the same mistake.
- When creating multiple entries in one request, each entry must match the user's specifications individually.

IMPORTANT — use the right tool for the job:
- For totals, sums, averages or any aggregation over time entries → use get_time_summary (never fetch raw time entry lists to calculate)
- For revenue, invoice totals or earnings in a period → use get_revenue_summary
- For expense totals or spending breakdowns → use get_expense_summary
- For profit/loss or net earnings → use get_profit_summary
- For a full picture of one client (hours + invoices) → use get_client_overview
- For a full picture of one project (hours, budget, invoices) → use get_project_overview
- Only use get_time_entries / get_invoices / get_expenses when the user explicitly wants to see the individual records (not totals).
- All date parameters use YYYY-MM-DD format. "This month" = start_date ${new Date().toISOString().slice(0, 7)}-01, end_date ${today}.

WORKFLOW FOR MULTI-STEP REQUESTS — plan, then act:
1. Resolve entities first. When the user names a project, client or task, look it up (e.g. get_projects, get_clients) and match by name. If the match is ambiguous or missing, ASK the user instead of guessing.
2. Gather the data you need with read tools, using filters and date ranges so you fetch only what's relevant. Prefer the summary/overview tools for totals and averages; only read raw lists when you need individual records (e.g. to derive patterns like average daily hours or typical start/end times).
3. For anything that CREATES, CHANGES or DELETES data: FIRST state your concrete plan in clear natural language (e.g. the exact entries you intend to create, with dates/hours/times), THEN issue the tool calls. Creates, updates and deletes always require the user's explicit approval before they take effect, so make your plan easy to review.
4. Act only on what the user asked, matching each item to their specifications exactly.

REPRODUCING OR EXTRAPOLATING FROM HISTORY (any records — time entries, invoice items, expenses, …):
- When the user asks for "the same as before" or to continue an existing pattern, first read the ACTUAL historical records (with filters), then match the observed values and structure exactly — real times, amounts, gaps, descriptions and counts. Never substitute round or generic values for what the data actually shows.
- Reproduce the real structure, including splits and recurring gaps (e.g. a regular midday break), and compute any derived figures precisely from the source values.
- Skip cases the history shows the user doesn't do, and skip records that already exist.
- If the history is sparse, inconsistent or ambiguous, say what you found and ask the user to confirm before creating anything.

FILTERING DATA:
- Narrow results at the source via query parameters (date ranges, status, project/client filters, search) rather than retrieving everything and filtering afterwards.
- When a result set is large, summarize it and offer to show specifics on request.${buildSystemPromptExtensions()}`;
  }

  /**
   * Calls the LLM with streaming, emitting TEXT_MESSAGE_* events for text chunks.
   * Returns the accumulated content and any tool_calls.
   */
  private async callLLM(
    messages: ConversationMessage[],
    tools: LLMTool[],
    _conversationId: string,
    emit: EventEmitter,
    toolChoice: 'auto' | 'none' = 'auto'
  ): Promise<{ content: string; toolCalls: LLMToolCall[] }> {
    const messageId = uuidv4();
    let accumulatedContent = '';
    const pendingToolCalls: Map<number, LLMToolCall> = new Map();
    let hasEmittedTextStart = false;

    const requestBody: Record<string, unknown> = {
      model: this.model,
      messages: applyToolContextBudget(messages),
      stream: true,
      temperature: Number(process.env.AI_TEMPERATURE ?? '0.2'),
    };
    if (tools.length > 0 && toolChoice !== 'none') {
      requestBody.tools = tools;
      requestBody.tool_choice = toolChoice;
    }

    const response = await this.client!.post('/chat/completions', requestBody, {
      responseType: 'stream',
      signal: this.abortSignal,
    });
    const stream = response.data as NodeJS.ReadableStream;

    await new Promise<void>((resolve, reject) => {
      let buffer = '';

      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const parsed: LLMStreamChunk = JSON.parse(trimmed.slice(6));
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;

            // Text content
            if (delta.content) {
              if (!hasEmittedTextStart) {
                emit({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' });
                hasEmittedTextStart = true;
              }
              emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: delta.content });
              accumulatedContent += delta.content;
            }

            // Tool calls
            if (delta.tool_calls) {
              for (const tcDelta of delta.tool_calls) {
                const idx = tcDelta.index ?? 0;
                if (!pendingToolCalls.has(idx)) {
                  pendingToolCalls.set(idx, {
                    id: tcDelta.id || uuidv4(),
                    type: 'function',
                    function: { name: '', arguments: '' },
                  });
                }
                const tc = pendingToolCalls.get(idx)!;
                if (tcDelta.id) tc.id = tcDelta.id;
                if (tcDelta.function?.name) tc.function.name += tcDelta.function.name;
                if (tcDelta.function?.arguments) tc.function.arguments += tcDelta.function.arguments;
              }
            }
          } catch {
            // Ignore malformed SSE lines
          }
        }
      });

      stream.on('end', () => resolve());
      stream.on('error', (err: Error) => reject(err));
    });

    if (hasEmittedTextStart) {
      emit({ type: EventType.TEXT_MESSAGE_END, messageId });
    }

    return {
      content: accumulatedContent,
      toolCalls: Array.from(pendingToolCalls.values()),
    };
  }
}

export const aiAssistantService = new AIAssistantService();
