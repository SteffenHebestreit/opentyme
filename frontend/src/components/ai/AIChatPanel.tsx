/**
 * AIChatPanel — the chat interface rendered inside the floating widget.
 * Supports text input and speech input (fast-whisper / Qwen3 ASR).
 */

import { memo, useEffect, useLayoutEffect, useRef, useState, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  ChevronRight,
  Loader2,
  MessageSquarePlus,
  Mic,
  MicOff,
  Pencil,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Square,
  Wrench,
  X,
} from 'lucide-react';
import type { UIMessage, PendingApproval } from '../../api/hooks/useAIChat';
import type { ApprovalAction, ApprovalDecision } from '../../api/services/ai-chat.service';
import { startRecording } from '../../api/services/ai-transcription.service';
import type { RecordingHandle, RecordingStatus, TranscriptionError } from '../../api/services/ai-transcription.service';
import { Slot } from '../../plugins/slots/Slot';
import { Button } from '../common/Button';
import { cn } from '../../lib/cn';

interface Props {
  messages: UIMessage[];
  isStreaming: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onStop: () => void;
  onClear: () => void;
  sttEnabled?: boolean;
  pendingApproval?: PendingApproval | null;
  onApprove?: (decisions: ApprovalDecision[]) => void;
  /** Shows a close button in the header (the widget passes it) */
  onClose?: () => void;
  /** Resend a user message that never reached the server */
  onRetryMessage?: (messageId: string) => void;
  /** The saved conversation could not be loaded */
  restoreFailed?: boolean;
  onRetryRestore?: () => void;
  onDismissError?: () => void;
}

/** Scrolled this close to the bottom counts as "following the conversation" */
const STICK_TO_BOTTOM_PX = 80;

// Guardrail: max input length
const MAX_INPUT_LENGTH = 4000;

const iconButtonClass =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:pointer-events-none disabled:opacity-40';

const codeBlockClass =
  'max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border border-gray-100 bg-gray-50 p-2 font-mono text-[11px] leading-relaxed text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300';

// ── Tool call step ───────────────────────────────────────────────────────────

type ToolOutcome = 'pending' | 'done' | 'failed' | 'skipped';

/** What a tool result says about the call: ran fine, failed, or was declined/skipped. */
function toolOutcome(result?: UIMessage): ToolOutcome {
  if (!result) return 'pending';
  try {
    const parsed = JSON.parse(result.content) as Record<string, unknown> | null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (parsed.declined === true || parsed.skipped === true) return 'skipped';
      if (parsed.error === true || (typeof parsed.http_status === 'number' && parsed.http_status >= 400)) return 'failed';
    }
  } catch {
    // not JSON — plain text result
  }
  return 'done';
}

const prettyJson = (raw?: string) => {
  if (!raw) return '';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

const ToolCallStep = memo(function ToolCallStep({ msg, result }: { msg: UIMessage; result?: UIMessage }) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const outcome = toolOutcome(result);

  return (
    <div className="animate-fade-in rounded-lg border border-gray-200 bg-white text-xs dark:border-gray-800 dark:bg-gray-900">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-gray-600 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 dark:text-gray-400 dark:hover:bg-white/[0.03]"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Wrench className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
        <span className={cn('truncate font-mono font-medium', outcome === 'skipped' && 'line-through opacity-70')}>
          {msg.toolName ?? 'tool'}()
        </span>
        {outcome === 'pending' && (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" aria-label={t('ai.toolRunning', 'Running…')} />
        )}
        {outcome === 'done' && (
          <span className="flex shrink-0 items-center text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">{t('ai.toolDone')}</span>
          </span>
        )}
        {outcome === 'failed' && (
          <span className="flex shrink-0 items-center gap-1 text-red-600 dark:text-red-400">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="text-[11px] font-medium">{t('ai.toolFailed', 'Failed')}</span>
          </span>
        )}
        {outcome === 'skipped' && (
          <span className="flex shrink-0 items-center gap-1 text-gray-500 dark:text-gray-400">
            <Ban className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="text-[11px] font-medium">{t('ai.toolSkipped', 'Not executed')}</span>
          </span>
        )}
        <ChevronRight
          className={cn(
            'ml-auto h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-200',
            open && 'rotate-90'
          )}
          aria-hidden="true"
        />
      </button>
      <div className="collapsible" data-open={open}>
        <div>
          {/* Formatting only while open — keeps long threads cheap while a reply streams */}
          {open && (
            <div className="space-y-2 px-2.5 pb-2.5 pt-1">
              {msg.toolArgs && (
                <div>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {t('ai.toolArguments')}
                  </div>
                  <pre className={codeBlockClass}>{prettyJson(msg.toolArgs)}</pre>
                </div>
              )}
              {result?.content && (
                <div>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {t('ai.toolResult')}
                  </div>
                  <pre className={codeBlockClass}>{prettyJson(result.content.slice(0, 8000))}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ── Write-approval card (human-in-the-loop) ──────────────────────────────────

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args ?? {});
  if (entries.length === 0) return '';
  return entries
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join('  ·  ');
}

function ApprovalCard({
  approval,
  onApprove,
}: {
  approval: PendingApproval;
  onApprove: (decisions: ApprovalDecision[]) => void;
}) {
  const { t } = useTranslation('common');
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  // Approve-with-edit: raw JSON text per action while the user is editing it.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleEdit = (a: ApprovalAction) =>
    setEditing((prev) => {
      const next = new Set(prev);
      if (next.has(a.toolCallId)) {
        next.delete(a.toolCallId);
      } else {
        next.add(a.toolCallId);
        setEdits((e) => ({ [a.toolCallId]: JSON.stringify(a.arguments, null, 2), ...e }));
      }
      return next;
    });

  /** Parsed edit for an action: undefined = unedited, null = invalid JSON. Kept after the editor closes. */
  const parsedEdit = (id: string): Record<string, unknown> | null | undefined => {
    if (edits[id] === undefined) return undefined;
    try {
      const v = JSON.parse(edits[id]);
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };

  const hasInvalidEdit = approval.actions.some((a) => !rejected.has(a.toolCallId) && parsedEdit(a.toolCallId) === null);

  const isEdited = (a: ApprovalAction) => {
    const edited = parsedEdit(a.toolCallId);
    return !!edited && JSON.stringify(edited) !== JSON.stringify(a.arguments);
  };

  const resetEdit = (id: string) => {
    setEdits(({ [id]: _dropped, ...rest }) => rest);
    setEditing((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const submit = (mode: 'all' | 'none' | 'selected') => {
    const decisions: ApprovalDecision[] = approval.actions.map((a) => {
      const decision =
        mode === 'all'
          ? 'approve'
          : mode === 'none'
            ? 'reject'
            : rejected.has(a.toolCallId)
              ? 'reject'
              : 'approve';
      const edited = decision === 'approve' ? parsedEdit(a.toolCallId) : undefined;
      return {
        toolCallId: a.toolCallId,
        decision,
        ...(edited && JSON.stringify(edited) !== JSON.stringify(a.arguments) ? { editedArguments: edited } : {}),
      } as ApprovalDecision;
    });
    onApprove(decisions);
  };

  return (
    <div className="mt-3 animate-fade-up rounded-xl border border-amber-200 bg-amber-50/70 text-xs dark:border-amber-500/25 dark:bg-amber-500/[0.06]">
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
          {t('ai.approvalTitle', 'Approve these changes?')}
        </span>
        <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 font-medium tabular-nums text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
          {approval.actions.length}
        </span>
      </div>
      <div className="space-y-1.5 px-3">
        {approval.actions.map((a) => {
          const isRejected = rejected.has(a.toolCallId);
          const isEditing = editing.has(a.toolCallId) && !isRejected;
          const editInvalid = parsedEdit(a.toolCallId) === null;
          const edited = isEdited(a);
          const argsText = formatArgs((edited ? parsedEdit(a.toolCallId) : null) ?? a.arguments);
          return (
            <div
              key={a.toolCallId}
              className={cn(
                'rounded-lg border bg-white px-2.5 py-2 transition-[opacity,border-color] duration-200 dark:bg-gray-900',
                isRejected
                  ? 'border-gray-200 opacity-60 dark:border-gray-800'
                  : 'border-emerald-200 dark:border-emerald-500/25'
              )}
            >
              <div className="flex w-full items-start gap-2">
                <button
                  type="button"
                  onClick={() => toggle(a.toolCallId)}
                  title={isRejected ? t('ai.willSkip', 'Will be skipped') : t('ai.willRun', 'Will run')}
                  aria-pressed={!isRejected}
                  className="flex min-w-0 flex-1 items-start gap-2 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                >
                  <span
                    className={cn(
                      'mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors',
                      isRejected
                        ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                        : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                    )}
                  >
                    {isRejected ? (
                      <X className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <Check className="h-3 w-3" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        'font-mono font-medium text-gray-800 dark:text-gray-100',
                        isRejected && 'line-through'
                      )}
                    >
                      {a.toolName}
                    </span>
                    {edited && !isRejected && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[10px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                        {t('ai.edited', 'edited')}
                      </span>
                    )}
                    <span className="sr-only">
                      {' — '}
                      {isRejected ? t('ai.willSkip', 'Will be skipped') : t('ai.willRun', 'Will run')}
                    </span>
                    {argsText && !isEditing && (
                      <span className="mt-0.5 block break-words text-[11px] text-gray-500 dark:text-gray-400">{argsText}</span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleEdit(a)}
                  disabled={isRejected}
                  title={t('ai.editArgs', 'Edit arguments before approving')}
                  aria-label={t('ai.editArgs', 'Edit arguments before approving')}
                  aria-pressed={isEditing}
                  className={cn(
                    'shrink-0 rounded-md p-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-30',
                    isEditing
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                      : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-white/5 dark:hover:text-gray-200'
                  )}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              {isEditing && (
                <textarea
                  value={edits[a.toolCallId] ?? ''}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [a.toolCallId]: e.target.value }))}
                  rows={4}
                  spellCheck={false}
                  aria-label={t('ai.editArgs', 'Edit arguments before approving')}
                  aria-invalid={editInvalid || undefined}
                  className={cn(
                    'mt-2 block w-full animate-fade-in rounded-md border bg-gray-50 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-gray-800 transition-[border-color,box-shadow] focus:outline-none focus:ring-4 dark:bg-gray-950 dark:text-gray-200',
                    editInvalid
                      ? 'border-red-400 focus:ring-red-500/15 dark:border-red-500/60'
                      : 'border-gray-200 focus:border-purple-500 focus:ring-purple-500/15 dark:border-gray-700 dark:focus:border-purple-400'
                  )}
                />
              )}
              {isEditing && (
                <div className="mt-1 flex items-center gap-2 text-[11px]">
                  {editInvalid && (
                    <span className="font-medium text-red-600 dark:text-red-400">{t('ai.invalidJson', 'Not a valid JSON object')}</span>
                  )}
                  {edits[a.toolCallId] !== undefined && (
                    <button
                      type="button"
                      onClick={() => resetEdit(a.toolCallId)}
                      className="ml-auto inline-flex items-center gap-1 rounded px-1 text-gray-500 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      {t('ai.resetEdit', 'Reset')}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 px-3 pt-3">
        <Button
          type="button"
          size="sm"
          variant="success"
          className="flex-1"
          onClick={() => submit(rejected.size === 0 ? 'all' : 'selected')}
          disabled={hasInvalidEdit}
          leftIcon={<Check className="h-4 w-4" aria-hidden="true" />}
        >
          {rejected.size === 0 ? t('ai.approveAll', 'Approve all') : t('ai.approveSelected', 'Approve selected')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="flex-1"
          onClick={() => submit('none')}
          leftIcon={<X className="h-4 w-4" aria-hidden="true" />}
        >
          {t('ai.rejectAll', 'Reject all')}
        </Button>
      </div>
      <div className="px-3 pb-3 pt-2 text-[11px] text-amber-800/70 dark:text-amber-200/60">
        {t('ai.approvalHint', 'Tap an item to toggle whether it runs.')}{' '}
        {t('ai.approvalSupersedeHint', 'Sending a new message discards these proposals.')}
      </div>
    </div>
  );
}

// ── Message bubble ───────────────────────────────────────────────────────────

const MessageBubble = memo(function MessageBubble({
  msg,
  toolResult,
  onRetry,
}: {
  msg: UIMessage;
  toolResult?: UIMessage;
  onRetry?: (messageId: string) => void;
}) {
  const { t } = useTranslation('common');
  if (msg.role === 'tool_call') {
    return <ToolCallStep msg={msg} result={toolResult} />;
  }
  if (msg.role === 'tool_result') {
    return null;
  }

  const isUser = msg.role === 'user';

  return (
    <div className={cn('flex animate-fade-up flex-col', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
          isUser
            ? 'rounded-br-md bg-purple-600 text-white'
            : 'rounded-bl-md bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100',
          msg.failed && 'opacity-60'
        )}
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
      >
        {msg.content}
        {msg.role === 'assistant' && msg.content === '' && (
          <span className="inline-flex items-center gap-1 py-1.5" aria-hidden="true">
            {[0, 200, 400].map((delay) => (
              <span
                key={delay}
                className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-gray-400 dark:bg-gray-500"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </span>
        )}
      </div>
      {msg.failed && (
        <div className="mt-1 flex items-center gap-2 text-[11px] text-red-600 dark:text-red-400">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          {t('ai.notSent', 'Not sent')}
          {onRetry && (
            <button
              type="button"
              onClick={() => onRetry(msg.id)}
              className="inline-flex items-center gap-1 rounded font-medium underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              {t('ai.retry', 'Retry')}
            </button>
          )}
        </div>
      )}
    </div>
  );
});

// ── Main panel ───────────────────────────────────────────────────────────────

export default function AIChatPanel({
  messages,
  isStreaming,
  error,
  onSend,
  onStop,
  onClear,
  sttEnabled = false,
  pendingApproval,
  onApprove,
  onClose,
  onRetryMessage,
  restoreFailed = false,
  onRetryRestore,
  onDismissError,
}: Props) {
  const { t } = useTranslation('common');
  const [input, setInput] = useState('');
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [speechError, setSpeechError] = useState<TranscriptionError | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recordingHandleRef = useRef<RecordingHandle | null>(null);
  const atBottomRef = useRef(true);

  const isRecording = recordingStatus === 'recording';
  const micBusy = recordingStatus === 'starting' || recordingStatus === 'transcribing';

  // Focus the input when the panel opens
  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Closing the panel must release the microphone and drop the recording
  useEffect(
    () => () => {
      recordingHandleRef.current?.cancel();
      recordingHandleRef.current = null;
    },
    []
  );

  // Back to the input when a reply finished (it stays focusable while streaming)
  const wasStreaming = useRef(isStreaming);
  useEffect(() => {
    if (wasStreaming.current && !isStreaming && scrollRef.current?.closest('[role="dialog"]')?.contains(document.activeElement ?? null)) {
      inputRef.current?.focus({ preventScroll: true });
    }
    wasStreaming.current = isStreaming;
  }, [isStreaming]);

  // Follow new output only while the user is at the bottom — reading earlier
  // messages or an open tool step must not be yanked away by streaming tokens.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, pendingApproval]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_TO_BOTTOM_PX;
    atBottomRef.current = bottom;
    setAtBottom(bottom);
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    atBottomRef.current = true;
    setAtBottom(true);
  };

  // Grow the textarea with its content (up to its max height)
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming || text.length > MAX_INPUT_LENGTH) return;
    setInput('');
    atBottomRef.current = true;
    setAtBottom(true);
    onSend(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter while an IME composition is open confirms the composition, not the message
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleRecording = () => {
    setSpeechError(null);
    if (recordingHandleRef.current) {
      recordingHandleRef.current.stop();
      recordingHandleRef.current = null;
      return;
    }
    if (micBusy) return;

    recordingHandleRef.current = startRecording(
      (text) => {
        setInput((prev) => (prev ? `${prev} ${text}` : text).slice(0, MAX_INPUT_LENGTH));
        inputRef.current?.focus({ preventScroll: true });
      },
      (err) => {
        setSpeechError(err);
        recordingHandleRef.current = null;
      },
      (status) => {
        setRecordingStatus(status);
        if (status === 'idle' || status === 'transcribing') recordingHandleRef.current = null;
      }
    );
  };

  // Build map tool_call_id → tool_result for inline pairing
  const toolResultMap = new Map<string, UIMessage>();
  for (const msg of messages) {
    if (msg.role === 'tool_result' && msg.toolCallId) {
      toolResultMap.set(msg.toolCallId, msg);
    }
  }

  const inputLength = input.length;
  const overLimit = inputLength > MAX_INPUT_LENGTH;

  const status = isStreaming
    ? 'thinking'
    : isRecording
      ? 'listening'
      : recordingStatus === 'transcribing'
        ? 'transcribing'
        : 'ready';

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600 ring-1 ring-inset ring-purple-600/10 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-400/20">
          <Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-white">{t('ai.title')}</h2>
          <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
            <span
              className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full',
                status === 'thinking' && 'animate-soft-pulse bg-purple-500 dark:bg-purple-400',
                status === 'listening' && 'animate-soft-pulse bg-red-500',
                status === 'transcribing' && 'animate-soft-pulse bg-amber-500',
                status === 'ready' && 'bg-emerald-500'
              )}
              aria-hidden="true"
            />
            {status === 'thinking'
              ? t('ai.thinking')
              : status === 'listening'
                ? t('ai.listening')
                : status === 'transcribing'
                  ? t('ai.transcribing', 'Transcribing…')
                  : t('ai.ready')}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          title={t('ai.newConversation')}
          aria-label={t('ai.newConversation')}
          className={cn(
            iconButtonClass,
            'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-white/5 dark:hover:text-gray-200'
          )}
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title={t('ai.close')}
            aria-label={t('ai.close')}
            className={cn(
              iconButtonClass,
              'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-white/5 dark:hover:text-gray-200'
            )}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain px-4 py-4">
          {restoreFailed && (
            <div className="mb-3 flex animate-fade-in items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">{t('ai.restoreFailed', 'The previous conversation could not be loaded.')}</span>
              {onRetryRestore && (
                <button
                  type="button"
                  onClick={onRetryRestore}
                  className="shrink-0 font-medium underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                >
                  {t('ai.retry', 'Retry')}
                </button>
              )}
            </div>
          )}
          {messages.length === 0 ? (
            <div className="flex h-full animate-fade-up flex-col items-center justify-center px-4 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 text-purple-600 ring-1 ring-inset ring-purple-600/10 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-400/20">
                <Sparkles className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="mt-4 text-sm font-semibold text-gray-900 dark:text-white">{t('ai.welcomeTitle')}</p>
              <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                {t('ai.welcomeBody')}
                {sttEnabled && (
                  <>
                    <br />
                    {t('ai.welcomeBodyMic')}
                  </>
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5" role="log" aria-live="polite" aria-relevant="additions">
              {messages.map((msg) => {
                if (msg.role === 'tool_result') return null;
                return (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    onRetry={onRetryMessage}
                    toolResult={
                      msg.role === 'tool_call' && msg.toolCallId
                        ? toolResultMap.get(msg.toolCallId)
                        : undefined
                    }
                  />
                );
              })}
            </div>
          )}

          {/* Write-approval prompt (human-in-the-loop) — inside the scroll area so it scrolls with the chat */}
          {pendingApproval && pendingApproval.actions.length > 0 && !isStreaming && onApprove && (
            <ApprovalCard key={pendingApproval.batchId ?? pendingApproval.actions[0]?.toolCallId} approval={pendingApproval} onApprove={onApprove} />
          )}
        </div>

        {!atBottom && messages.length > 0 && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 animate-fade-in items-center gap-1 rounded-full border border-gray-200 bg-white/95 px-3 py-1 text-xs font-medium text-gray-600 shadow-lifted backdrop-blur hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-300 dark:hover:text-white"
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            {t('ai.jumpToLatest', 'Latest')}
          </button>
        )}
      </div>

      {/* Error banners */}
      {(error || speechError) && (
        <div
          role="alert"
          className="mx-4 mb-2 flex animate-fade-in items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
        >
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 break-words">{error ?? speechError?.message}</span>
          {!error && speechError?.retry && (
            <button
              type="button"
              onClick={() => {
                const retry = speechError.retry;
                setSpeechError(null);
                retry?.();
              }}
              className="shrink-0 font-medium underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            >
              {t('ai.retry', 'Retry')}
            </button>
          )}
          <button
            type="button"
            onClick={() => (error ? onDismissError?.() : setSpeechError(null))}
            className="-m-0.5 shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            aria-label={t('buttons.close', 'Close')}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 border-t border-gray-100 px-3 pb-2 pt-2.5 dark:border-gray-800">
        {/* Addon quick-action buttons (slot) */}
        <Slot name="ai-chat-actions" context={{ onSend, isStreaming }} className="mb-2 flex flex-wrap gap-1.5" />
        <div
          className={cn(
            'flex items-end gap-1.5 rounded-xl border bg-white p-1.5 shadow-sm transition-[border-color,box-shadow] duration-150 focus-within:ring-4 dark:bg-gray-950/40',
            overLimit
              ? 'border-red-400 focus-within:ring-red-500/15 dark:border-red-500/60'
              : 'border-gray-300 focus-within:border-purple-500 focus-within:ring-purple-500/15 dark:border-gray-700 dark:focus-within:border-purple-400 dark:focus-within:ring-purple-400/15'
          )}
        >
          {/* Mic button — only shown when speech-to-text is configured */}
          {sttEnabled && (
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isStreaming || micBusy}
              title={isRecording ? t('ai.stopRecording') : t('ai.startRecording')}
              aria-label={isRecording ? t('ai.stopRecording') : t('ai.startRecording')}
              aria-pressed={isRecording}
              className={cn(
                iconButtonClass,
                isRecording
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-purple-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-purple-400'
              )}
            >
              {micBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : isRecording ? (
                <MicOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Mic className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          )}

          {/* Text input — stays focusable while a reply streams; sending is what's blocked */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_LENGTH))}
            onKeyDown={handleKeyDown}
            placeholder={t('ai.inputPlaceholder')}
            aria-label={t('ai.placeholder')}
            readOnly={isRecording}
            rows={1}
            maxLength={MAX_INPUT_LENGTH}
            className="min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm leading-5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 read-only:opacity-60 dark:text-gray-100 dark:placeholder:text-gray-500"
            style={{ minHeight: 32, maxHeight: 120 }}
          />

          {/* Send / Stop button */}
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className={cn(
                iconButtonClass,
                'bg-gray-900 text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white'
              )}
              title={t('ai.stop')}
              aria-label={t('ai.stop')}
            >
              <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || overLimit}
              className={cn(iconButtonClass, 'bg-purple-600 text-white hover:bg-purple-500')}
              title={t('ai.send')}
              aria-label={t('ai.send')}
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-[11px] text-gray-400 dark:text-gray-500">
          <span className="hidden truncate sm:block">{t('ai.inputHint')}</span>
          {inputLength > MAX_INPUT_LENGTH * 0.8 && (
            <span className={cn('ml-auto tabular-nums', overLimit && 'text-red-600 dark:text-red-400')}>
              {inputLength}/{MAX_INPUT_LENGTH}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
