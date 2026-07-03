/**
 * Streaming chat-completions client for OpenAI-compatible endpoints (LM Studio).
 * Emits AG-UI TEXT_MESSAGE_* events for text chunks while accumulating the full
 * content and any tool calls.
 */

import { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { EventType, EventEmitter } from './ai-events';
import { ConversationMessage, LLMToolCall, applyToolContextBudget } from './conversation-history.service';
import { LLMTool } from './openapi-tool-builder.service';

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

export interface LLMStreamResult {
  content: string;
  toolCalls: LLMToolCall[];
}

export interface StreamChatOptions {
  client: AxiosInstance;
  model: string;
  messages: ConversationMessage[];
  tools: LLMTool[];
  emit: EventEmitter;
  toolChoice?: 'auto' | 'none';
  signal?: AbortSignal;
}

/**
 * Calls the LLM with streaming. Applies the tool-context budget to the outgoing
 * messages, emits TEXT_MESSAGE_* events for streamed text, and returns the
 * accumulated content plus any tool_calls assembled from the delta stream.
 */
export async function streamChatCompletion(options: StreamChatOptions): Promise<LLMStreamResult> {
  const { client, model, messages, tools, emit, toolChoice = 'auto', signal } = options;

  const messageId = uuidv4();
  let accumulatedContent = '';
  const pendingToolCalls: Map<number, LLMToolCall> = new Map();
  let hasEmittedTextStart = false;

  // Sampling: Qwen's function-calling guidance recommends temperature 0.7 /
  // top_p 0.8 for Qwen3-class models and explicitly warns that near-greedy
  // decoding CAUSES repetition and endless tool-call loops on these models
  // (qwen.readthedocs.io function_call docs; model card discussions). Safety
  // against runaway behavior comes from the loop guards + HITL, not low temp.
  const requestBody: Record<string, unknown> = {
    model,
    messages: applyToolContextBudget(messages),
    stream: true,
    temperature: Number(process.env.AI_TEMPERATURE ?? '0.7'),
    top_p: Number(process.env.AI_TOP_P ?? '0.8'),
  };
  if (process.env.AI_PRESENCE_PENALTY) {
    requestBody.presence_penalty = Number(process.env.AI_PRESENCE_PENALTY);
  }
  if (tools.length > 0 && toolChoice !== 'none') {
    requestBody.tools = tools;
    requestBody.tool_choice = toolChoice;
  }

  const response = await client.post('/chat/completions', requestBody, {
    responseType: 'stream',
    signal,
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
