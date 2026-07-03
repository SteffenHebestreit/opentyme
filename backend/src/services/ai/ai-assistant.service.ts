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
import { buildSystemPrompt } from './system-prompt.builder';
import { LLMTool } from './openapi-tool-builder.service';
import { selectTools } from './tool-selection.service';
import { executeToolCall, isWriteTool } from './tool-executor.service';

// Re-exported for existing importers (controller, A2A adapter).
export type { EventEmitter } from './ai-events';
export type { ConversationMessage } from './conversation-history.service';

export interface ToolApprovalDecision {
  toolCallId: string;
  decision: 'approve' | 'reject';
}

const MAX_ITERATIONS = Number(process.env.AI_MAX_ITERATIONS) || 12;

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
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
      // Rebuild context from history. The pending write tool_calls are still
      // legitimately unanswered — exempt them from synthetic-result injection,
      // since real results are appended below.
      const keepDangling = new Set(pending.map((tc) => tc.id));
      const messages: ConversationMessage[] = [
        { role: 'system', content: buildSystemPrompt(userFullName, userEmail, language) },
        ...(await loadHistory(conversationId, keepDangling)),
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
   * Supersedes approvals still awaiting a decision in this conversation:
   * persists a declined tool result for each pending write (keeping the stored
   * message sequence API-valid) and flips their status so /approve can no
   * longer execute them.
   */
  private async supersedeStaleApprovals(conversationId: string): Promise<void> {
    const db = pool();
    const stale = await db.query(
      `SELECT id, metadata FROM ai_messages
       WHERE conversation_id = $1 AND role = 'assistant' AND metadata->>'status' = 'awaiting_approval'`,
      [conversationId]
    );

    for (const row of stale.rows) {
      const pending = (row.metadata?.pending ?? []) as LLMToolCall[];
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
      await db.query(`UPDATE ai_messages SET metadata = $1 WHERE id = $2`, [
        JSON.stringify({ status: 'superseded' }),
        row.id,
      ]);
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

    try {
      let finalized = false;
      let lastSignature = '';

      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const { content, toolCalls } = await this.callLLM(messages, tools, emit);

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
