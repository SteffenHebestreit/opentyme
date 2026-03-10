/**
 * AIChatPanel — the chat interface rendered inside the floating widget.
 * Supports text input and speech input (fast-whisper / Qwen3 ASR).
 */

import React, { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Square, Trash2, ChevronRight, ChevronDown, Wrench, Mic, MicOff } from 'lucide-react';
import type { UIMessage } from '../../api/hooks/useAIChat';
import { startRecording } from '../../api/services/ai-transcription.service';
import type { RecordingHandle } from '../../api/services/ai-transcription.service';
import { Slot } from '../../plugins/slots/Slot';

interface Props {
  messages: UIMessage[];
  isStreaming: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onStop: () => void;
  onClear: () => void;
  sttEnabled?: boolean;
}

// Guardrail: max input length
const MAX_INPUT_LENGTH = 4000;

// ── Tool call step ───────────────────────────────────────────────────────────

function ToolCallStep({ msg, result }: { msg: UIMessage; result?: UIMessage }) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);

  let argsDisplay = '';
  try {
    argsDisplay = msg.toolArgs ? JSON.stringify(JSON.parse(msg.toolArgs), null, 2) : '';
  } catch {
    argsDisplay = msg.toolArgs ?? '';
  }

  let resultDisplay = '';
  try {
    resultDisplay = result?.content
      ? JSON.stringify(JSON.parse(result.content), null, 2)
      : (result?.content ?? '');
  } catch {
    resultDisplay = result?.content ?? '';
  }

  return (
    <div className="my-1 rounded-lg border border-purple-500/20 dark:border-purple-400/20 bg-white/60 dark:bg-gray-800/60 text-xs backdrop-blur-sm">
      <button
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-gray-600 dark:text-gray-400 hover:bg-purple-50/50 dark:hover:bg-purple-900/20 transition-colors rounded-lg"
        onClick={() => setOpen((o) => !o)}
      >
        <Wrench size={12} className="shrink-0 text-purple-500" />
        <span className="font-mono font-medium truncate">{msg.toolName ?? 'tool'}()</span>
        {open ? (
          <ChevronDown size={12} className="ml-auto shrink-0 text-purple-400" />
        ) : (
          <ChevronRight size={12} className="ml-auto shrink-0 text-purple-400" />
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {argsDisplay && (
            <div>
              <div className="text-purple-400 dark:text-purple-300 font-semibold mb-0.5 text-[10px] uppercase tracking-wider">
                {t('ai.toolArguments')}
              </div>
              <pre className="overflow-x-auto rounded-md bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-2 text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all">
                {argsDisplay}
              </pre>
            </div>
          )}
          {resultDisplay && (
            <div>
              <div className="text-purple-400 dark:text-purple-300 font-semibold mb-0.5 text-[10px] uppercase tracking-wider">
                {t('ai.toolResult')}
              </div>
              <pre className="overflow-x-auto rounded-md bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-2 text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all max-h-48">
                {resultDisplay}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, toolResult }: { msg: UIMessage; toolResult?: UIMessage }) {
  if (msg.role === 'tool_call') {
    return <ToolCallStep msg={msg} result={toolResult} />;
  }
  if (msg.role === 'tool_result') {
    return null;
  }

  const isUser = msg.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-br-sm shadow-md shadow-purple-500/20'
            : 'bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-sm shadow-sm backdrop-blur-sm'
        }`}
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
      >
        {msg.content}
        {msg.role === 'assistant' && msg.content === '' && (
          <span className="inline-flex gap-0.5 opacity-60">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export default function AIChatPanel({ messages, isStreaming, error, onSend, onStop, onClear, sttEnabled = false }: Props) {
  const { t } = useTranslation('common');
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recordingHandleRef = useRef<RecordingHandle | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    onSend(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleRecording = () => {
    setSpeechError(null);
    if (isRecording) {
      recordingHandleRef.current?.stop();
      recordingHandleRef.current = null;
      return;
    }

    const handle = startRecording(
      (text) => {
        setInput((prev) => (prev ? `${prev} ${text}` : text).slice(0, MAX_INPUT_LENGTH));
        recordingHandleRef.current = null;
      },
      (msg) => {
        setSpeechError(msg);
        recordingHandleRef.current = null;
      },
      setIsRecording
    );
    if (handle) {
      recordingHandleRef.current = handle;
    }
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

  return (
    <div className="flex flex-col h-full bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-900/10 to-indigo-900/10 dark:from-purple-900/40 dark:to-indigo-900/40 border-b border-purple-500/20 dark:border-purple-500/30 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-sm shadow-purple-500/30">
            <span className="text-white text-xs font-bold">AI</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t('ai.title')}</div>
            {isStreaming && (
              <div className="text-xs text-purple-500 dark:text-purple-400 animate-pulse">{t('ai.thinking')}</div>
            )}
            {isRecording && !isStreaming && (
              <div className="text-xs text-pink-500 dark:text-pink-400 animate-pulse">{t('ai.listening')}</div>
            )}
          </div>
        </div>
        <button
          onClick={onClear}
          title={t('ai.newConversation')}
          className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto px-4 ${
          messages.length === 0
            ? 'flex flex-col items-center justify-center'
            : 'py-4 space-y-0.5'
        }`}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center text-center gap-3 py-6">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500/20 to-indigo-500/20 dark:from-purple-500/30 dark:to-indigo-500/30 flex items-center justify-center border border-purple-500/20">
              <span className="text-2xl">✨</span>
            </div>
            <div className="font-semibold text-gray-700 dark:text-gray-200">{t('ai.welcomeTitle')}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 max-w-[220px]">
              {t('ai.welcomeBody')}
              <br />
              {t('ai.welcomeBodyMic')}
            </div>
          </div>
        )}
        {messages.map((msg) => {
          if (msg.role === 'tool_result') return null;
          return (
            <MessageBubble
              key={msg.id}
              msg={msg}
              toolResult={
                msg.role === 'tool_call' && msg.toolCallId
                  ? toolResultMap.get(msg.toolCallId)
                  : undefined
              }
            />
          );
        })}
      </div>

      {/* Error banners */}
      {(error || speechError) && (
        <div className="mx-4 mb-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-lg text-xs text-red-600 dark:text-red-400">
          {error ?? speechError}
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 border-t border-gray-200 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm px-3 py-3">
        {/* Addon quick-action buttons (slot) */}
        <Slot name="ai-chat-actions" context={{ onSend, isStreaming }} className="flex flex-wrap gap-1.5 mb-2" />
        <div className="flex items-center gap-2">
          {/* Mic button — only shown when speech-to-text is configured */}
          {sttEnabled && <button
            onClick={toggleRecording}
            disabled={isStreaming}
            title={isRecording ? t('ai.stopRecording') : t('ai.startRecording')}
            className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40 ${
              isRecording
                ? 'bg-pink-500 hover:bg-pink-600 text-white animate-pulse shadow-sm shadow-pink-500/30'
                : 'bg-gray-100 dark:bg-gray-700 hover:bg-purple-100 dark:hover:bg-purple-900/30 text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400'
            }`}
          >
            {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
          </button>}

          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_LENGTH))}
              onKeyDown={handleKeyDown}
              placeholder={t('ai.placeholder')}
              disabled={isStreaming || isRecording}
              rows={1}
              maxLength={MAX_INPUT_LENGTH}
              className={`w-full resize-none rounded-xl border px-3 py-2.5 text-sm text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-700 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 dark:focus:ring-purple-400/50 disabled:opacity-50 transition-colors ${
                overLimit
                  ? 'border-red-400 dark:border-red-500'
                  : 'border-gray-200 dark:border-gray-600'
              }`}
              style={{ minHeight: 42, maxHeight: 120 }}
            />
            {inputLength > MAX_INPUT_LENGTH * 0.8 && (
              <div
                className={`absolute -bottom-4 right-1 text-[10px] ${overLimit ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}
              >
                {inputLength}/{MAX_INPUT_LENGTH}
              </div>
            )}
          </div>

          {/* Send / Stop button */}
          {isStreaming ? (
            <button
              onClick={onStop}
              className="shrink-0 w-9 h-9 rounded-xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-sm"
              title={t('ai.stop')}
            >
              <Square size={15} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming || overLimit}
              className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-purple-500/30"
              title={t('ai.send')}
            >
              <Send size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
