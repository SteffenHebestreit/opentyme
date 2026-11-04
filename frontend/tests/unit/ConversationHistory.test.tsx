/**
 * The assistant's conversation list: shows which token started a
 * conversation and which ones wait for approval, opens one on click and
 * deletes one after a confirmation.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationHistory } from '../../src/components/ai/ConversationHistory';
import type { Conversation } from '../../src/api/services/ai-chat.service';
import { confirmDialog } from '../../src/lib/confirm';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown> | string) => {
      const value = typeof options === 'object' ? (options?.name ?? options?.title) : undefined;
      return value ? `${key}:${value}` : key;
    },
    i18n: { language: 'en' },
  }),
}));

jest.mock('../../src/lib/confirm', () => ({ confirmDialog: jest.fn() }));
const confirmMock = confirmDialog as jest.MockedFunction<typeof confirmDialog>;

beforeEach(() => {
  confirmMock.mockReset();
});

const now = new Date().toISOString();
const conversations: Conversation[] = [
  { id: 'c1', title: 'Log my hours', created_at: now, updated_at: now, api_token_id: 't1', api_token_name: 'Claude Code', awaiting_approval: true },
  { id: 'c2', title: null, created_at: now, updated_at: now, api_token_id: null, api_token_name: null, awaiting_approval: false },
];

it('labels token conversations and the ones waiting for approval', () => {
  render(<ConversationHistory conversations={conversations} loadError={false} activeThreadId="c2" onOpen={jest.fn()} onBack={jest.fn()} />);

  const fromToken = screen.getByRole('button', { name: /Log my hours/ });
  expect(within(fromToken).getByText('ai.viaToken:Claude Code')).toBeInTheDocument();
  expect(within(fromToken).getByText('ai.needsApproval')).toBeInTheDocument();

  const own = screen.getByRole('button', { name: /ai.untitled/ });
  expect(own).toHaveAttribute('aria-current', 'true');
  expect(within(own).queryByText(/ai.viaToken/)).not.toBeInTheDocument();
  expect(within(own).queryByText('ai.needsApproval')).not.toBeInTheDocument();
});

it('opens a conversation and goes back', async () => {
  const onOpen = jest.fn();
  const onBack = jest.fn();
  render(<ConversationHistory conversations={conversations} loadError={false} activeThreadId={null} onOpen={onOpen} onBack={onBack} />);
  const user = userEvent.setup();

  expect(screen.getByRole('button', { name: 'ai.backToChat' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: /Log my hours/ }));
  expect(onOpen).toHaveBeenCalledWith('c1');
  await user.click(screen.getByRole('button', { name: 'ai.backToChat' }));
  expect(onBack).toHaveBeenCalled();
});

it('shows loading, empty and error states', () => {
  const { rerender } = render(
    <ConversationHistory conversations={undefined} loadError={false} activeThreadId={null} onOpen={jest.fn()} onBack={jest.fn()} />
  );
  expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  rerender(<ConversationHistory conversations={[]} loadError={false} activeThreadId={null} onOpen={jest.fn()} onBack={jest.fn()} />);
  expect(screen.getByText('ai.historyEmpty')).toBeInTheDocument();
  rerender(<ConversationHistory conversations={[]} loadError activeThreadId={null} onOpen={jest.fn()} onBack={jest.fn()} />);
  expect(screen.getByText('ai.historyLoadError')).toBeInTheDocument();
});

describe('deleting', () => {
  const three: Conversation[] = [
    ...conversations,
    { id: 'c3', title: 'Old chat', created_at: now, updated_at: now, api_token_id: null, api_token_name: null, awaiting_approval: false },
  ];

  it('has no delete buttons without onDelete', () => {
    render(<ConversationHistory conversations={three} loadError={false} activeThreadId={null} onOpen={jest.fn()} onBack={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /^ai\.deleteConversation/ })).not.toBeInTheDocument();
  });

  it('deletes after confirmation and moves the focus to the next conversation', async () => {
    confirmMock.mockResolvedValue(true);
    const onDelete = jest.fn().mockResolvedValue(true);
    const onOpen = jest.fn();
    render(
      <ConversationHistory conversations={three} loadError={false} activeThreadId={null} onOpen={onOpen} onBack={jest.fn()} onDelete={onDelete} />
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'ai.deleteConversation:Log my hours' }));

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'danger', message: 'ai.deleteConfirmMessage:Log my hours' })
    );
    expect(onDelete).toHaveBeenCalledWith('c1');
    expect(onOpen).not.toHaveBeenCalled();
    // c2 has no title — its row is the untitled one
    await waitFor(() => expect(screen.getByRole('button', { name: /^ai\.untitled/ })).toHaveFocus());
  });

  it('moves the focus back to "Back" when the last conversation is gone', async () => {
    confirmMock.mockResolvedValue(true);
    const only = [three[2]];
    render(
      <ConversationHistory conversations={only} loadError={false} activeThreadId={null} onOpen={jest.fn()} onBack={jest.fn()} onDelete={jest.fn().mockResolvedValue(true)} />
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'ai.deleteConversation:Old chat' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'ai.backToChat' })).toHaveFocus());
  });

  it('keeps the conversation when the confirmation is cancelled', async () => {
    confirmMock.mockResolvedValue(false);
    const onDelete = jest.fn();
    render(
      <ConversationHistory conversations={three} loadError={false} activeThreadId={null} onOpen={jest.fn()} onBack={jest.fn()} onDelete={onDelete} />
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'ai.deleteConversation:Old chat' }));
    expect(confirmMock).toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('offers no delete for the conversation the assistant is answering in', () => {
    render(
      <ConversationHistory conversations={three} loadError={false} activeThreadId="c3" activeBusy onOpen={jest.fn()} onBack={jest.fn()} onDelete={jest.fn()} />
    );
    expect(screen.queryByRole('button', { name: 'ai.deleteConversation:Old chat' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ai.deleteConversation:Log my hours' })).toBeInTheDocument();
  });
});
