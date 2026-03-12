/**
 * Core AI Assistant orchestration service.
 * Streams AG-UI protocol events back to the caller via the emitEvent callback.
 * Uses the user's Bearer token for all tool calls → enforces user-level authorization.
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
} as const;
import { logger } from '../../utils/logger';
import { pool } from '../../utils/database';
import { buildTools } from './openapi-tool-builder.service';
import { executeToolCall } from './tool-executor.service';
import { buildSystemPromptExtensions } from './system-prompt-registry.service';

// ---- Types ----------------------------------------------------------------

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'tool';
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

// AG-UI emitter callback – caller passes res.write binding
export type EventEmitter = (event: Record<string, unknown>) => void;

// ---- Service ----------------------------------------------------------------

export class AIAssistantService {
  private client: AxiosInstance | null = null;
  private model = 'qwen/qwen3-v1-30b';
  private enabled = false;

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
    emit: EventEmitter
  ): Promise<void> {
    const runId = uuidv4();
    const db = pool();

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

    // Load recent conversation history
    const historyResult = await db.query(
      `SELECT role, content, tool_calls, tool_call_id, tool_name
       FROM ai_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT 40`,
      [conversationId]
    );

    const history: ConversationMessage[] = historyResult.rows.map((row) => ({
      role: row.role as ConversationMessage['role'],
      content: row.content,
      ...(row.tool_calls ? { tool_calls: row.tool_calls } : {}),
      ...(row.tool_call_id ? { tool_call_id: row.tool_call_id } : {}),
      ...(row.tool_name ? { name: row.tool_name } : {}),
    }));

    const systemPrompt = `You are the AI assistant for OpenTYME, a time tracking and invoicing application for freelancers and small businesses.
Today is ${new Date().toISOString().split('T')[0]}. User: ${userFullName} (${userEmail}).
You have tools that call the application REST API on the user's behalf.
Always fetch real data rather than guessing. Summarize results concisely and helpfully.
When creating or modifying data, confirm what was done.
Always respond in the user's preferred language: ${language}.

IMPORTANT — use the right tool for the job:
- For totals, sums, averages or any aggregation over time entries → use get_time_summary (never fetch raw time entry lists to calculate)
- For revenue, invoice totals or earnings in a period → use get_revenue_summary
- For expense totals or spending breakdowns → use get_expense_summary
- For profit/loss or net earnings → use get_profit_summary
- For a full picture of one client (hours + invoices) → use get_client_overview
- For a full picture of one project (hours, budget, invoices) → use get_project_overview
- Only use get_time_entries / get_invoices / get_expenses when the user explicitly wants to see the individual records (not totals).
- All date parameters use YYYY-MM-DD format. "This month" = start_date ${new Date().toISOString().slice(0, 7)}-01, end_date ${new Date().toISOString().split('T')[0]}.${buildSystemPromptExtensions()}`;

    const messages: ConversationMessage[] = [
      { role: 'user', content: systemPrompt },
      ...history,
    ];

    const tools = buildTools();
    const MAX_ITERATIONS = 5;

    try {
      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const { content, toolCalls } = await this.callLLM(messages, tools, conversationId, emit);

        if (toolCalls.length === 0) {
          // Final response — persist and finish
          await db.query(
            `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`,
            [conversationId, content]
          );
          break;
        }

        // Persist assistant message with tool_calls
        await db.query(
          `INSERT INTO ai_messages (conversation_id, role, content, tool_calls) VALUES ($1, 'assistant', $2, $3)`,
          [conversationId, content || null, JSON.stringify(toolCalls)]
        );

        // Append assistant message with tool_calls once (before executing them)
        messages.push({
          role: 'assistant',
          content: content || null,
          tool_calls: toolCalls,
        });

        // Execute tool calls
        for (const tc of toolCalls) {
          const tcId = tc.id;
          const tcName = tc.function.name;
          let argsObj: Record<string, unknown> = {};
          try {
            argsObj = JSON.parse(tc.function.arguments || '{}');
          } catch {
            argsObj = {};
          }

          emit({
            type: EventType.TOOL_CALL_START,
            toolCallId: tcId,
            toolCallName: tcName,
          });
          emit({
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: tcId,
            delta: tc.function.arguments || '{}',
          });
          emit({ type: EventType.TOOL_CALL_END, toolCallId: tcId });

          let resultContent: string;
          try {
            const result = await executeToolCall(tcName, argsObj, bearerToken);
            resultContent = JSON.stringify(result.data ?? result.error ?? '');
          } catch (toolErr: any) {
            resultContent = JSON.stringify({ error: `Tool execution failed: ${toolErr.message}` });
          }

          emit({
            type: EventType.TOOL_CALL_RESULT,
            toolCallId: tcId,
            content: resultContent.slice(0, 8000),
          });

          // Persist tool result
          await db.query(
            `INSERT INTO ai_messages (conversation_id, role, content, tool_call_id, tool_name)
             VALUES ($1, 'tool', $2, $3, $4)`,
            [conversationId, resultContent, tcId, tcName]
          );

          // Append tool result to history for next LLM call
          messages.push({
            role: 'tool',
            content: resultContent,
            tool_call_id: tcId,
            name: tcName,
          });
        }
      }

      // Update conversation updated_at
      await db.query(
        `UPDATE ai_conversations SET updated_at = NOW() WHERE id = $1`,
        [conversationId]
      );

      emit({ type: EventType.RUN_FINISHED, threadId: conversationId, runId });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[AI] runStream error: ${message}`);
      emit({ type: EventType.RUN_ERROR, message, code: 'INTERNAL' });
    }
  }

  /**
   * Calls the LLM with streaming, emitting TEXT_MESSAGE_* events for text chunks.
   * Returns the accumulated content and any tool_calls.
   */
  private async callLLM(
    messages: ConversationMessage[],
    tools: ReturnType<typeof buildTools>,
    _conversationId: string,
    emit: EventEmitter
  ): Promise<{ content: string; toolCalls: LLMToolCall[] }> {
    const messageId = uuidv4();
    let accumulatedContent = '';
    const pendingToolCalls: Map<number, LLMToolCall> = new Map();
    let hasEmittedTextStart = false;

    const requestBody = {
      model: this.model,
      messages,
      tools,
      stream: true,
    };

    const response = await this.client!.post('/chat/completions', requestBody);
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
