/**
 * Deleting a conversation from the assistant's history: the cached list drops
 * it, deleting the open one starts a new chat, "already gone" counts as
 * deleted, and a refusal (busy / error) keeps it with a message.
 */
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AI_CONVERSATIONS_QUERY_KEY, useDeleteConversation } from '../../src/api/hooks/useDeleteConversation';
import { deleteConversation } from '../../src/api/services/ai-chat.service';
import type { Conversation } from '../../src/api/services/ai-chat.service';
import { toast } from '../../src/lib/toast';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
jest.mock('../../src/api/services/ai-chat.service', () => ({ deleteConversation: jest.fn() }));
jest.mock('../../src/lib/toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

const deleteMock = deleteConversation as jest.MockedFunction<typeof deleteConversation>;
const now = new Date().toISOString();
const list: Conversation[] = ['c1', 'c2'].map((id) => ({
  id,
  title: id,
  created_at: now,
  updated_at: now,
  api_token_id: null,
  api_token_name: null,
  awaiting_approval: false,
}));
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });

function setup(activeThreadId: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(AI_CONVERSATIONS_QUERY_KEY, list);
  const onActiveDeleted = jest.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useDeleteConversation(activeThreadId, onActiveDeleted), { wrapper });
  const cachedIds = () => queryClient.getQueryData<Conversation[]>(AI_CONVERSATIONS_QUERY_KEY)?.map((c) => c.id);
  return { remove: result.current, onActiveDeleted, cachedIds };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('removes the conversation from the list', async () => {
  deleteMock.mockResolvedValue(undefined);
  const { remove, onActiveDeleted, cachedIds } = setup('c2');
  let ok = false;
  await act(async () => {
    ok = await remove('c1');
  });
  expect(ok).toBe(true);
  expect(deleteMock).toHaveBeenCalledWith('c1');
  expect(cachedIds()).toEqual(['c2']);
  expect(onActiveDeleted).not.toHaveBeenCalled();
});

it('starts a new chat when the open conversation is deleted', async () => {
  deleteMock.mockResolvedValue(undefined);
  const { remove, onActiveDeleted } = setup('c1');
  await act(async () => {
    await remove('c1');
  });
  expect(onActiveDeleted).toHaveBeenCalledTimes(1);
});

it('treats "not found" as already deleted', async () => {
  deleteMock.mockRejectedValue(httpError(404));
  const { remove, cachedIds } = setup(null);
  let ok = false;
  await act(async () => {
    ok = await remove('c2');
  });
  expect(ok).toBe(true);
  expect(cachedIds()).toEqual(['c1']);
  expect(toast.error).not.toHaveBeenCalled();
});

it.each([
  [409, 'ai.deleteBusy'],
  [500, 'ai.deleteError'],
])('keeps the conversation on HTTP %i and says why', async (status, message) => {
  deleteMock.mockRejectedValue(httpError(status));
  const { remove, onActiveDeleted, cachedIds } = setup('c1');
  let ok = true;
  await act(async () => {
    ok = await remove('c1');
  });
  expect(ok).toBe(false);
  expect(cachedIds()).toEqual(['c1', 'c2']);
  expect(onActiveDeleted).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(message);
});
