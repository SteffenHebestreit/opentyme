/**
 * AI Chat API service.
 * Handles SSE streaming via AG-UI protocol and CRUD for conversations.
 */

import { EventType } from '../../types/ag-ui-events';
import type { AgentEvent } from '../../types/ag-ui-events';
import apiClient from './client';
import { getAccessToken } from '../../services/auth/tokenManager';
import i18n from '../../i18n/config';

// Guardrails
const MAX_MESSAGE_LENGTH = 4000;
const STREAM_TIMEOUT_MS = 120_000;

export interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: ConversationMessage[];
}

/** Persisted tool-call record (OpenAI function-calling shape). */
export interface ToolCallRecord {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCallRecord[] | null;
  tool_call_id?: string;
  tool_name?: string;
  /** Approval state for assistant messages that proposed writes. */
  metadata?: { status?: string; pending?: ToolCallRecord[] } | null;
  created_at: string;
}

// Re-export for consumers
export type { AgentEvent };

export interface StreamChatOptions {
  message: string;
  threadId?: string | null;
  onEvent: (event: AgentEvent) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
}

interface StreamSSEOptions {
  onEvent: (event: AgentEvent) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
}

/**
 * POSTs a JSON body and consumes an AG-UI SSE stream.
 * Returns the resolved threadId (conversationId) once RUN_STARTED is received.
 */
async function streamSSE(url: string, body: unknown, options: StreamSSEOptions): Promise<string | null> {
  const { onEvent, onDone, onError, signal } = options;

  const token = getAccessToken();
  if (!token) {
    onError?.('Not authenticated');
    return null;
  }

  // Timeout guard
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), STREAM_TIMEOUT_MS);

  const combinedSignal = signal
    ? createCombinedSignal(signal, timeoutController.signal)
    : timeoutController.signal;

  let resolvedThreadId: string | null = null;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal: combinedSignal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      onError?.(`Request failed (${response.status}): ${errorText.slice(0, 200)}`);
      return null;
    }

    if (!response.body) {
      onError?.('No response stream');
      return null;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed === 'data: [DONE]') {
          onDone?.();
          return resolvedThreadId;
        }
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const event = JSON.parse(trimmed.slice(6)) as AgentEvent;
          if (event.type === EventType.RUN_STARTED && event.threadId) {
            resolvedThreadId = event.threadId as string;
          }
          onEvent(event);
        } catch {
          // Ignore malformed SSE line
        }
      }
    }

    onDone?.();
    return resolvedThreadId;
  } catch (error: unknown) {
    if ((error as Error)?.name === 'AbortError') {
      onError?.('Request timed out or was cancelled');
    } else {
      const msg = error instanceof Error ? error.message : String(error);
      onError?.(msg.slice(0, 200));
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Stream a chat message using AG-UI SSE protocol.
 */
export async function streamChat(options: StreamChatOptions): Promise<string | null> {
  const { message, threadId, onEvent, onDone, onError, signal } = options;

  if (!message || message.trim().length === 0) {
    onError?.('Message cannot be empty');
    return null;
  }
  const trimmedMessage = message.trim().slice(0, MAX_MESSAGE_LENGTH);

  return streamSSE(
    '/api/ai/run',
    { message: trimmedMessage, threadId: threadId ?? undefined, language: i18n.language },
    { onEvent, onDone, onError, signal }
  );
}

// ── Write-approval (human-in-the-loop) ──────────────────────────────────────

export interface ApprovalAction {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface ApprovalDecision {
  toolCallId: string;
  decision: 'approve' | 'reject';
}

export interface ApproveActionsOptions {
  conversationId: string;
  approvals: ApprovalDecision[];
  onEvent: (event: AgentEvent) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
}

/**
 * Resume a run that paused for write approval, streaming the continuation.
 */
export async function approveActions(options: ApproveActionsOptions): Promise<string | null> {
  const { conversationId, approvals, onEvent, onDone, onError, signal } = options;
  return streamSSE(
    `/api/ai/run/${conversationId}/approve`,
    { approvals, language: i18n.language },
    { onEvent, onDone, onError, signal }
  );
}

function createCombinedSignal(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

export async function getConversations(): Promise<Conversation[]> {
  const { data } = await apiClient.get<Conversation[]>('/ai/conversations');
  return data;
}

export async function getConversation(id: string): Promise<ConversationWithMessages> {
  const { data } = await apiClient.get<ConversationWithMessages>(`/ai/conversations/${id}`);
  return data;
}

export async function deleteConversation(id: string): Promise<void> {
  await apiClient.delete(`/ai/conversations/${id}`);
}
