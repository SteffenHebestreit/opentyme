/**
 * useAIChat — React hook for the AI assistant.
 * Manages conversation state, streaming, write-approval (human-in-the-loop),
 * and localStorage persistence of threadId.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { EventType } from '../../types/ag-ui-events';
import type { AgentEvent } from '../../types/ag-ui-events';
import { streamChat, approveActions, getConversation } from '../services/ai-chat.service';
import type { ApprovalAction, ApprovalDecision, StreamResult, ToolCallRecord } from '../services/ai-chat.service';
import { notifyDataChanged } from '../../lib/dataSync';
import i18n from '../../i18n/config';

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
  /** User message that never reached the server (can be resent) */
  failed?: boolean;
}

export interface PendingApproval {
  planText: string;
  actions: ApprovalAction[];
  /** Id of the assistant message holding these actions (server-side batch) */
  batchId?: string | null;
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

const tAi = (key: string, fallback: string) => i18n.t(`common:ai.errors.${key}`, { defaultValue: fallback }) as string;

/** User-facing text for a RUN_ERROR the server reported mid-run. */
function runErrorMessage(code: unknown, message: unknown): string {
  switch (code) {
    case '404':
      return tAi('notFound', 'This conversation no longer exists. Start a new one.');
    case 'DISABLED':
      return tAi('disabled', 'The AI assistant is switched off in the settings.');
    case 'NO_PENDING':
      return tAi('noPending', 'These changes were already decided — nothing left to approve.');
    case 'STALE_APPROVAL':
      return tAi('staleApproval', 'These proposed changes were replaced by newer ones — nothing was executed.');
    case 'LLM_CONTEXT':
      return tAi('llmContext', 'The conversation has become too long for the model. Start a new conversation.');
    case 'LLM_UNREACHABLE':
      return tAi('llmUnreachable', 'The language model is not reachable. Check the AI settings (URL) and whether the model server is running.');
    case 'LLM_TIMEOUT':
      return tAi('llmTimeout', 'The language model took too long to answer. Please try again.');
    case 'LLM_AUTH':
      return tAi('llmAuth', 'The language model rejected the API key. Check it in the AI settings.');
    case 'LLM_MODEL':
      return tAi('llmModel', 'The configured model is not available on the model server. Check the model name in the AI settings.');
    default:
      return typeof message === 'string' && message ? message : tAi('server', 'Something went wrong.');
  }
}

export function useAIChat() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  /** The saved conversation could not be loaded (transient) — offer a retry */
  const [restoreFailed, setRestoreFailed] = useState(false);

  // threadId persisted in localStorage so it survives page reload
  const [threadId, setThreadId] = useState<string | null>(() =>
    localStorage.getItem(THREAD_STORAGE_KEY)
  );
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  const abortRef = useRef<AbortController | null>(null);
  const currentAssistantIdRef = useRef<string | null>(null);
  const didRestoreRef = useRef(false);
  /**
   * Generation of the current run. Stop / new conversation bump it, so late
   * callbacks of a run that was left behind don't touch the new state.
   */
  const runGenerationRef = useRef(0);
  /** Tool names of the actions awaiting approval — results of declined ones arrive without a start event */
  const approvalToolNamesRef = useRef(new Map<string, string>());
  // The assistant's tools run server-side, so the API client never sees those
  // writes. Refresh the app's data once a run that called tools has finished.
  const toolRanRef = useRef(false);

  useEffect(() => {
    if (!isStreaming && toolRanRef.current) {
      toolRanRef.current = false;
      notifyDataChanged();
    }
  }, [isStreaming]);

  // Restore the persisted conversation after a page reload: the threadId
  // survives in localStorage but messages and any pending write-approval only
  // live in React state. Both are durably stored server-side, so refetch them
  // once on mount — otherwise a reload silently hides an awaiting approval.
  const restore = useCallback((id: string) => {
    setRestoreFailed(false);
    getConversation(id)
      .then((conv) => {
        // "New conversation" (or another thread) while the request was in flight
        if (threadIdRef.current !== id) return;
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
              batchId: awaiting.id,
              actions: pending.map((tc) => ({
                toolCallId: tc.id,
                toolName: tc.function.name,
                arguments: safeParseJson(tc.function.arguments),
              })),
            }
          );
        }
      })
      .catch((err: unknown) => {
        if (threadIdRef.current !== id) return;
        // Only a 404 (or an invalid id) means the conversation is actually gone.
        // Transient failures (backend restart, network blip, token refresh) must
        // NOT discard the thread — it may hold a pending write-approval.
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404 || status === 400) {
          localStorage.removeItem(THREAD_STORAGE_KEY);
          threadIdRef.current = null;
          setThreadId(null);
        } else {
          setRestoreFailed(true);
        }
      });
  }, []);

  useEffect(() => {
    if (!threadId || didRestoreRef.current) return;
    didRestoreRef.current = true;
    restore(threadId);
  }, [threadId, restore]);

  const retryRestore = useCallback(() => {
    if (threadIdRef.current) restore(threadIdRef.current);
  }, [restore]);

  /** Re-read which approval is pending on the server (after STALE_APPROVAL or a stopped run). */
  const reloadPendingApproval = useCallback((tid: string) => {
    void getConversation(tid)
      .then((conv) => {
        if (threadIdRef.current !== tid) return;
        const awaiting = [...conv.messages]
          .reverse()
          .find((m) => m.role === 'assistant' && m.metadata?.status === 'awaiting_approval');
        const pending = awaiting?.metadata?.pending ?? [];
        if (awaiting && pending.length > 0) {
          setPendingApproval({
            planText: awaiting.content ?? '',
            batchId: awaiting.id,
            actions: pending.map((tc) => ({
              toolCallId: tc.id,
              toolName: tc.function.name,
              arguments: safeParseJson(tc.function.arguments),
            })),
          });
        }
      })
      .catch(() => undefined);
  }, []);

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
            threadIdRef.current = tid;
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
          toolRanRef.current = true;
          setMessages((prev) => {
            const result: UIMessage = {
              id: generateId(),
              role: 'tool_result',
              content: (event.content as string) ?? '',
              toolCallId: tcId,
            };
            // Declined actions get a result without a start event — add the step so it shows up live
            const hasCall = prev.some((m) => m.role === 'tool_call' && m.toolCallId === tcId);
            const call: UIMessage[] = hasCall
              ? []
              : [{
                  id: generateId(),
                  role: 'tool_call',
                  content: '',
                  toolCallId: tcId,
                  toolName: approvalToolNamesRef.current.get(tcId) ?? 'tool',
                  toolArgs: '',
                }];
            return [...prev, ...call, result].slice(-MAX_DISPLAY_MESSAGES);
          });
          break;
        }

        case EventType.TOOL_APPROVAL_REQUIRED: {
          const actions = (event.actions as ApprovalAction[]) ?? [];
          setPendingApproval({
            planText: (event.planText as string) ?? '',
            actions,
            batchId: (event.batchId as string | undefined) ?? null,
          });
          break;
        }

        case EventType.RUN_ERROR: {
          setError(runErrorMessage(event.code, event.message));
          if (event.code === 'STALE_APPROVAL' && threadIdRef.current) {
            // Show the batch that is actually pending now
            reloadPendingApproval(threadIdRef.current);
          }
          if (event.code === '404') {
            localStorage.removeItem(THREAD_STORAGE_KEY);
            threadIdRef.current = null;
            setThreadId(null);
          }
          break;
        }

        default:
          break;
      }
    },
    [appendMessage, updateLastAssistantMessage, reloadPendingApproval]
  );

  /** Start a run; anything it reports after a newer run (or a reset) took over is ignored. */
  const beginRun = useCallback(() => {
    runGenerationRef.current += 1;
    const generation = runGenerationRef.current;
    abortRef.current = new AbortController();
    const isCurrent = () => runGenerationRef.current === generation;
    return {
      signal: abortRef.current.signal,
      isCurrent,
      onEvent: (event: AgentEvent) => {
        if (isCurrent()) handleEvent(event);
      },
      finish: () => {
        if (!isCurrent()) return;
        setIsStreaming(false);
        abortRef.current = null;
      },
    };
  }, [handleEvent]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (isStreaming) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      setError(null);
      setPendingApproval(null);
      setIsStreaming(true);

      const userMessageId = generateId();
      appendMessage({ id: userMessageId, role: 'user', content: trimmed });

      const run = beginRun();
      const result = await streamChat({
        message: trimmed,
        threadId: threadIdRef.current,
        signal: run.signal,
        onEvent: run.onEvent,
      });

      if (run.isCurrent()) {
        if (result.error) {
          setError(result.error.message);
          // Never reached the server — mark it so it can be resent
          if (!result.started) {
            setMessages((prev) => prev.map((m) => (m.id === userMessageId ? { ...m, failed: true } : m)));
          }
          if (result.error.kind === 'not_found') {
            localStorage.removeItem(THREAD_STORAGE_KEY);
            threadIdRef.current = null;
            setThreadId(null);
          }
        }
        if (result.threadId && !threadIdRef.current) {
          threadIdRef.current = result.threadId;
          setThreadId(result.threadId);
          localStorage.setItem(THREAD_STORAGE_KEY, result.threadId);
        }
      }
      run.finish();
    },
    [isStreaming, appendMessage, beginRun]
  );

  /** Resend a message that failed to reach the server. */
  const retryMessage = useCallback(
    (messageId: string) => {
      const failed = messages.find((m) => m.id === messageId && m.failed);
      if (!failed || isStreaming) return;
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      void sendMessage(failed.content);
    },
    [messages, isStreaming, sendMessage]
  );

  // Resume a paused run with the user's approve/reject decisions.
  const approve = useCallback(
    async (decisions: ApprovalDecision[]) => {
      const conversationId = threadIdRef.current;
      if (isStreaming || !conversationId) return;

      const approval = pendingApproval;
      approvalToolNamesRef.current = new Map((approval?.actions ?? []).map((a) => [a.toolCallId, a.toolName]));
      const approvedAny = decisions.some((d) => d.decision === 'approve');

      setError(null);
      setPendingApproval(null);
      setIsStreaming(true);

      const run = beginRun();
      let result: StreamResult | null = null;
      try {
        result = await approveActions({
          conversationId,
          approvals: decisions,
          batchId: approval?.batchId,
          signal: run.signal,
          onEvent: run.onEvent,
        });
      } finally {
        // Writes may have run even if this stream was stopped or broke off
        // afterwards — refresh the app's data whenever something was approved.
        if (approvedAny) notifyDataChanged();
      }

      if (run.isCurrent() && result && !result.started && approval) {
        // Rejected before the server took it (429, expired session, network, stopped
        // right away): the approval is still pending there — bring the card back.
        if (result.error || result.aborted) setPendingApproval(approval);
      }
      if (run.isCurrent() && result?.error) setError(result.error.message);
      // Stopped mid-run: the server puts actions that hadn't started back up for approval
      if (result?.aborted && result.started && threadIdRef.current === conversationId) {
        setTimeout(() => reloadPendingApproval(conversationId), 800);
      }
      run.finish();
    },
    [isStreaming, pendingApproval, beginRun, reloadPendingApproval]
  );

  const stopStreaming = useCallback(() => {
    // The run notices its own abort (and restores an approval it hadn't sent yet)
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const clearConversation = useCallback(() => {
    runGenerationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    threadIdRef.current = null;
    setMessages([]);
    setThreadId(null);
    setError(null);
    setRestoreFailed(false);
    setPendingApproval(null);
    setIsStreaming(false);
    localStorage.removeItem(THREAD_STORAGE_KEY);
  }, []);

  /** Switch to another saved conversation (from the history list). */
  const openConversation = useCallback(
    (id: string) => {
      if (id === threadIdRef.current) return;
      runGenerationRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      threadIdRef.current = id;
      didRestoreRef.current = true;
      setMessages([]);
      setThreadId(id);
      setError(null);
      setPendingApproval(null);
      setIsStreaming(false);
      localStorage.setItem(THREAD_STORAGE_KEY, id);
      restore(id);
    },
    [restore]
  );

  const dismissError = useCallback(() => setError(null), []);

  return {
    messages,
    isStreaming,
    error,
    threadId,
    pendingApproval,
    restoreFailed,
    sendMessage,
    retryMessage,
    retryRestore,
    approve,
    stopStreaming,
    clearConversation,
    openConversation,
    dismissError,
  };
}
