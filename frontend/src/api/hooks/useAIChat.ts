/**
 * useAIChat — React hook for the AI assistant.
 * Manages conversation state, streaming, and localStorage persistence of threadId.
 */

import { useState, useCallback, useRef } from 'react';
import { EventType } from '../../types/ag-ui-events';
import type { AgentEvent } from '../../types/ag-ui-events';
import { streamChat } from '../services/ai-chat.service';

export type MessageRole = 'user' | 'assistant' | 'tool_call' | 'tool_result';

export interface UIMessage {
  id: string;
  role: MessageRole;
  content: string;
  // For tool_call messages
  toolCallId?: string;
  toolName?: string;
  toolArgs?: string;
  // For tool_result messages
  toolStatus?: number;
}

const THREAD_STORAGE_KEY = 'ai_chat_thread_id';
const MAX_DISPLAY_MESSAGES = 200;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useAIChat() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // threadId persisted in localStorage so it survives page reload
  const [threadId, setThreadId] = useState<string | null>(() =>
    localStorage.getItem(THREAD_STORAGE_KEY)
  );

  const abortRef = useRef<AbortController | null>(null);

  const appendMessage = useCallback((msg: UIMessage) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      return next.slice(-MAX_DISPLAY_MESSAGES);
    });
  }, []);

  const updateLastAssistantMessage = useCallback((delta: string) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== 'assistant') return prev;
      return [
        ...prev.slice(0, -1),
        { ...last, content: last.content + delta },
      ];
    });
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (isStreaming) return;
      if (!text.trim()) return;

      setError(null);
      setIsStreaming(true);

      // Append user message
      appendMessage({ id: generateId(), role: 'user', content: text.trim() });

      // Create abort controller for this request
      abortRef.current = new AbortController();

      let currentAssistantId: string | null = null;

      const resolvedThreadId = await streamChat({
        message: text,
        threadId,
        signal: abortRef.current.signal,
        onEvent: (event: AgentEvent) => {
          switch (event.type) {
            case EventType.RUN_STARTED: {
              if (event.threadId) {
                const tid = event.threadId as string;
                setThreadId(tid);
                localStorage.setItem(THREAD_STORAGE_KEY, tid);
              }
              break;
            }

            case EventType.TEXT_MESSAGE_START: {
              currentAssistantId = generateId();
              appendMessage({ id: currentAssistantId, role: 'assistant', content: '' });
              break;
            }

            case EventType.TEXT_MESSAGE_CONTENT: {
              if (event.delta) {
                updateLastAssistantMessage(event.delta as string);
              }
              break;
            }

            case EventType.TEXT_MESSAGE_END: {
              currentAssistantId = null;
              break;
            }

            case EventType.TOOL_CALL_START: {
              const tcId = event.toolCallId as string;
              appendMessage({
                id: generateId(),
                role: 'tool_call',
                content: '',
                toolCallId: tcId,
                toolName: event.toolCallName as string,
                toolArgs: '',
              });
              break;
            }

            case EventType.TOOL_CALL_ARGS: {
              const tcId = event.toolCallId as string;
              if (event.delta) {
                setMessages((prev) => {
                  // ES2020-compatible reverse search (findLastIndex requires ES2023)
                  let idx = -1;
                  for (let i = prev.length - 1; i >= 0; i--) {
                    if (prev[i].role === 'tool_call' && prev[i].toolCallId === tcId) {
                      idx = i;
                      break;
                    }
                  }
                  if (idx === -1) return prev;
                  const updated = { ...prev[idx], toolArgs: (prev[idx].toolArgs ?? '') + (event.delta as string) };
                  return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
                });
              }
              break;
            }

            case EventType.TOOL_CALL_RESULT: {
              const tcId = event.toolCallId as string;
              appendMessage({
                id: generateId(),
                role: 'tool_result',
                content: (event.content as string) ?? '',
                toolCallId: tcId,
              });
              break;
            }

            case EventType.RUN_ERROR: {
              setError((event.message as string) ?? 'Unknown error');
              break;
            }

            default:
              break;
          }
        },
        onDone: () => {
          setIsStreaming(false);
        },
        onError: (msg) => {
          setError(msg);
          setIsStreaming(false);
        },
      });

      if (resolvedThreadId && !threadId) {
        setThreadId(resolvedThreadId);
        localStorage.setItem(THREAD_STORAGE_KEY, resolvedThreadId);
      }

      setIsStreaming(false);
      abortRef.current = null;
    },
    [isStreaming, threadId, appendMessage, updateLastAssistantMessage]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const clearConversation = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setThreadId(null);
    setError(null);
    setIsStreaming(false);
    localStorage.removeItem(THREAD_STORAGE_KEY);
  }, []);

  return {
    messages,
    isStreaming,
    error,
    threadId,
    sendMessage,
    stopStreaming,
    clearConversation,
  };
}
