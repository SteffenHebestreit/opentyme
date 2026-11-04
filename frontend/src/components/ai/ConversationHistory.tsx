/**
 * ConversationHistory — the list of saved assistant conversations inside the
 * chat panel. Marks conversations started by an API token (e.g. an external
 * agent) and those whose actions wait for approval, so the owner can find and
 * approve them. Old conversations can be deleted (after a confirmation).
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, KeyRound, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import type { Conversation } from '../../api/services/ai-chat.service';
import { formatDistanceToNow } from '../../utils/date';
import { confirmDialog } from '../../lib/confirm';
import { cn } from '../../lib/cn';

interface ConversationHistoryProps {
  /** undefined while loading */
  conversations: Conversation[] | undefined;
  loadError: boolean;
  activeThreadId: string | null;
  /** The assistant is answering in the active conversation — it can't be deleted now */
  activeBusy?: boolean;
  onOpen: (id: string) => void;
  onBack: () => void;
  /** Deletes a conversation, resolving true once it is gone. Without it there are no delete buttons. */
  onDelete?: (id: string) => Promise<boolean>;
}

export function ConversationHistory({
  conversations,
  loadError,
  activeThreadId,
  activeBusy = false,
  onOpen,
  onBack,
  onDelete,
}: ConversationHistoryProps) {
  const { t } = useTranslation('common');
  const backRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    backRef.current?.focus({ preventScroll: true });
  }, []);

  const titleOf = (conversation: Conversation) => conversation.title || t('ai.untitled', 'Untitled conversation');

  const handleDelete = async (conversation: Conversation) => {
    if (!onDelete || deletingId) return;
    const confirmed = await confirmDialog({
      title: t('ai.deleteConfirmTitle', 'Delete this conversation?'),
      message: t('ai.deleteConfirmMessage', {
        title: titleOf(conversation),
        defaultValue: '“{{title}}” and all its messages will be deleted permanently.',
      }),
      tone: 'danger',
    });
    if (!confirmed) return;

    // Once the row is gone, focus moves to the next conversation (else the previous one, else Back)
    const list = conversations ?? [];
    const index = list.findIndex((c) => c.id === conversation.id);
    const neighbourId = list[index + 1]?.id ?? list[index - 1]?.id;

    setDeletingId(conversation.id);
    let deleted = false;
    try {
      deleted = await onDelete(conversation.id);
    } finally {
      setDeletingId(null);
    }
    if (!deleted) return;
    const neighbour = neighbourId
      ? listRef.current?.querySelector<HTMLElement>(`[data-conversation-id="${neighbourId}"]`)
      : null;
    (neighbour ?? backRef.current)?.focus({ preventScroll: true });
  };

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
          <ul ref={listRef} className="space-y-0.5">
            {conversations.map((conversation) => {
              const active = conversation.id === activeThreadId;
              const deleting = conversation.id === deletingId;
              const title = titleOf(conversation);
              // The conversation the assistant is answering in stays (the server refuses too)
              const deletable = !!onDelete && !(active && activeBusy);
              return (
                <li key={conversation.id} className="group relative">
                  <button
                    type="button"
                    data-conversation-id={conversation.id}
                    onClick={() => onOpen(conversation.id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'w-full rounded-lg py-2.5 pl-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                      // room for the delete button, so the title never runs under it
                      onDelete ? 'pr-11' : 'pr-3',
                      active
                        ? 'bg-brand-50/70 dark:bg-brand-500/10'
                        : 'hover:bg-gray-50 dark:hover:bg-white/[0.04]',
                      deleting && 'opacity-60'
                    )}
                  >
                    <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>{formatDistanceToNow(conversation.updated_at)}</span>
                      {(conversation.api_token_name || conversation.started_by_token) && (
                        <span className="inline-flex items-center gap-1">
                          <KeyRound className="h-3 w-3" aria-hidden="true" />
                          {conversation.api_token_name
                            ? t('ai.viaToken', { name: conversation.api_token_name, defaultValue: 'via {{name}}' })
                            : t('ai.viaRevokedToken', 'via a revoked API token')}
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
                  {deletable && (
                    <button
                      type="button"
                      // not `disabled` while deleting: that would drop the focus mid-way
                      onClick={() => void handleDelete(conversation)}
                      aria-busy={deleting || undefined}
                      aria-label={t('ai.deleteConversation', { title, defaultValue: 'Delete “{{title}}”' })}
                      title={t('buttons.delete', 'Delete')}
                      className={cn(
                        'absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition-[color,background-color,opacity] hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-500 dark:hover:bg-red-500/10 dark:hover:text-red-400',
                        // Shown on hover / keyboard focus of the row; always on touch screens
                        deleting
                          ? 'opacity-100'
                          : 'opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100'
                      )}
                    >
                      {deleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
