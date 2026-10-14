/**
 * ConversationHistory — the list of saved assistant conversations inside the
 * chat panel. Marks conversations started by an API token (e.g. an external
 * agent) and those whose actions wait for approval, so the owner can find and
 * approve them.
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, KeyRound, ShieldAlert } from 'lucide-react';
import type { Conversation } from '../../api/services/ai-chat.service';
import { formatDistanceToNow } from '../../utils/date';
import { cn } from '../../lib/cn';

interface ConversationHistoryProps {
  /** undefined while loading */
  conversations: Conversation[] | undefined;
  loadError: boolean;
  activeThreadId: string | null;
  onOpen: (id: string) => void;
  onBack: () => void;
}

export function ConversationHistory({ conversations, loadError, activeThreadId, onOpen, onBack }: ConversationHistoryProps) {
  const { t } = useTranslation('common');
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    backRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="absolute inset-0 z-10 flex animate-fade-in flex-col bg-white dark:bg-gray-900">
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-3 dark:border-gray-800">
        <button
          ref={backRef}
          type="button"
          onClick={onBack}
          aria-label={t('ai.backToChat', 'Back to the chat')}
          title={t('ai.backToChat', 'Back to the chat')}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-100"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t('ai.history', 'Conversations')}</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {loadError ? (
          <p className="px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
            {t('ai.historyLoadError', 'The conversations could not be loaded.')}
          </p>
        ) : !conversations ? (
          <div className="space-y-2 p-2" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-white/[0.04]" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
            {t('ai.historyEmpty', 'No saved conversations yet.')}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {conversations.map((conversation) => {
              const active = conversation.id === activeThreadId;
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(conversation.id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'w-full rounded-lg px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                      active
                        ? 'bg-brand-50/70 dark:bg-brand-500/10'
                        : 'hover:bg-gray-50 dark:hover:bg-white/[0.04]'
                    )}
                  >
                    <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
                      {conversation.title || t('ai.untitled', 'Untitled conversation')}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>{formatDistanceToNow(conversation.updated_at)}</span>
                      {conversation.api_token_name && (
                        <span className="inline-flex items-center gap-1">
                          <KeyRound className="h-3 w-3" aria-hidden="true" />
                          {t('ai.viaToken', { name: conversation.api_token_name, defaultValue: 'via {{name}}' })}
                        </span>
                      )}
                      {conversation.awaiting_approval && (
                        <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300">
                          <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                          {t('ai.needsApproval', 'Needs your approval')}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
