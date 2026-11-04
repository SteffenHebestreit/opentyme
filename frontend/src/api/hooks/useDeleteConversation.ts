/**
 * useDeleteConversation — removes a saved assistant conversation for the
 * history list. Deleting the conversation that is open starts a new one; one
 * that is already gone (deleted in another tab) simply leaves the list.
 *
 * `/ai/*` writes don't trigger the app-wide data refresh (lib/dataSync), so
 * the cached list is updated here.
 */
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { deleteConversation } from '../services/ai-chat.service';
import type { Conversation } from '../services/ai-chat.service';
import { toast } from '../../lib/toast';

export const AI_CONVERSATIONS_QUERY_KEY = ['aiConversations'] as const;

const httpStatus = (err: unknown): number | undefined =>
  (err as { response?: { status?: number } } | null)?.response?.status;

/**
 * @param activeThreadId - the conversation open in the chat
 * @param onActiveDeleted - called when that one was deleted (start a new chat)
 * @returns delete(id), resolving true once the conversation is gone
 */
export function useDeleteConversation(activeThreadId: string | null, onActiveDeleted: () => void) {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();

  return useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await deleteConversation(id);
      } catch (err: unknown) {
        const status = httpStatus(err);
        if (status === 409) {
          toast.error(
            t('ai.deleteBusy', 'The assistant is still working in this conversation. Delete it once it has finished.')
          );
          return false;
        }
        if (status !== 404) {
          toast.error(t('ai.deleteError', 'The conversation could not be deleted.'));
          return false;
        }
        // 404: already deleted elsewhere — take it off the list all the same
      }
      queryClient.setQueryData<Conversation[]>(AI_CONVERSATIONS_QUERY_KEY, (list) =>
        list?.filter((conversation) => conversation.id !== id)
      );
      // The list shows the newest 50 — the next older one moves up
      void queryClient.invalidateQueries({ queryKey: AI_CONVERSATIONS_QUERY_KEY });
      if (id === activeThreadId) onActiveDeleted();
      return true;
    },
    [activeThreadId, onActiveDeleted, queryClient, t]
  );
}
