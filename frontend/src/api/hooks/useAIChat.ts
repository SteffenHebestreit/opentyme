/**
 * useAIChat — React hook for the AI assistant.
 * Manages conversation state, streaming, write-approval (human-in-the-loop),
 * and localStorage persistence of threadId.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { EventType } from '../../types/ag-ui-events';
import type { AgentEvent } from '../../types/ag-ui-events';
import { streamChat, approveActions, getConversation } from '../services/ai-chat.service';
import type { ApprovalAction, ApprovalDecision, ToolCallRecord } from '../services/ai-chat.service';

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

export interface PendingApproval {
  planText: string;
  actions: ApprovalAction[];
}

const THREAD_STORAGE_KEY = 'ai_chat_thread_id';
const MAX_DISPLAY_MESSAGES = 200;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

export function useAIChat() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);

  // threadId persisted in localStorage so it survives page reload
  const [threadId, setThreadId] = useState<string | null>(() =>
    localStorage.getItem(THREAD_STORAGE_KEY)
  );

  const abortRef = useRef<AbortController | null>(null);
  const currentAssistantIdRef = useRef<string | null>(null);
  const didRestoreRef = useRef(false);

  // Restore the persisted conversation after a page reload: the threadId
  // survives in localStorage but messages and any pending write-approval only
  // live in React state. Both are durably stored server-side, so refetch them
  // once on mount — otherwise a reload silently hides an awaiting approval.
  useEffect(() => {
    if (!threadId || didRestoreRef.current) return;
    didRestoreRef.current = true;

    getConversation(threadId)
      .then((conv) => {
        const restored: UIMessage[] = [];
        for (const m of conv.messages) {
          if (m.role === 'user') {
            restored.push({ id: m.id, role: 'user', content: m.content ?? '' });
          } else if (m.role === 'assistant') {
            if (m.content) restored.push({ id: m.id, role: 'assistant', content: m.content });
            for (const tc of m.tool_calls ?? []) {
              restored.push({
                id: `${m.id}-${tc.id}`,
                role: 'tool_call',
                content: '',
                toolCallId: tc.id,
                toolName: tc.function?.name,
                toolArgs: tc.function?.arguments ?? '',
              });
            }
          } else if (m.role === 'tool') {
            restored.push({ id: m.id, role: 'tool_result', content: m.content ?? '', toolCallId: m.tool_call_id });
          }
        }
        // Don't clobber anything the user did while the fetch was in flight.
        setMessages((prev) => (prev.length > 0 ? prev : restored.slice(-MAX_DISPLAY_MESSAGES)));

        // Restore an approval that is still awaiting a decision.
        const awaiting = [...conv.messages]
          .reverse()
          .find((m) => m.role === 'assistant' && m.metadata?.status === 'awaiting_approval');
        const pending: ToolCallRecord[] = awaiting?.metadata?.pending ?? [];
        if (awaiting && pending.length > 0) {
          setPendingApproval((prev) =>
            prev ?? {
              planText: awaiting.content ?? '',
              actions: pending.map((tc) => ({
                toolCallId: tc.id,
                toolName: tc.function.name,
                arguments: safeParseJson(tc.function.arguments),
              })),
            }
          );
        }
      })
      .catch(() => {
        // Conversation gone (deleted / other device) — start fresh.
        localStorage.removeItem(THREAD_STORAGE_KEY);
        setThreadId(null);
      });
  }, [threadId]);

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
      return [...prev.slice(0, -1), { ...last, content: last.content + delta }];
    });
  }, []);

  // Shared AG-UI event handler used by both sendMessage and approve.
  const handleEvent = useCallback(
    (event: AgentEvent) => {
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
          const id = generateId();
          currentAssistantIdRef.current = id;
          appendMessage({ id, role: 'assistant', content: '' });
          break;
        }

        case EventType.TEXT_MESSAGE_CONTENT: {
          if (event.delta) updateLastAssistantMessage(event.delta as string);
          break;
        }

        case EventType.TEXT_MESSAGE_END: {
          currentAssistantIdRef.current = null;
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

        case EventType.TOOL_APPROVAL_REQUIRED: {
          const actions = (event.actions as ApprovalAction[]) ?? [];
          setPendingApproval({ planText: (event.planText as string) ?? '', actions });
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
    [appendMessage, updateLastAssistantMessage]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (isStreaming) return;
      if (!text.trim()) return;

      setError(null);
      setPendingApproval(null);
      setIsStreaming(true);

      appendMessage({ id: generateId(), role: 'user', content: text.trim() });

      abortRef.current = new AbortController();

      const resolvedThreadId = await streamChat({
        message: text,
        threadId,
        signal: abortRef.current.signal,
        onEvent: handleEvent,
        onDone: () => setIsStreaming(false),
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
    [isStreaming, threadId, appendMessage, handleEvent]
  );

  // Resume a paused run with the user's approve/reject decisions.
  const approve = useCallback(
    async (decisions: ApprovalDecision[]) => {
      if (isStreaming || !threadId) return;

      setError(null);
      setPendingApproval(null);
      setIsStreaming(true);

      abortRef.current = new AbortController();

      await approveActions({
        conversationId: threadId,
        approvals: decisions,
        signal: abortRef.current.signal,
        onEvent: handleEvent,
        onDone: () => setIsStreaming(false),
        onError: (msg) => {
          setError(msg);
          setIsStreaming(false);
        },
      });

      setIsStreaming(false);
      abortRef.current = null;
    },
    [isStreaming, threadId, handleEvent]
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
    setPendingApproval(null);
    setIsStreaming(false);
    localStorage.removeItem(THREAD_STORAGE_KEY);
  }, []);

  return {
    messages,
    isStreaming,
    error,
    threadId,
    pendingApproval,
    sendMessage,
    approve,
    stopStreaming,
    clearConversation,
  };
}
