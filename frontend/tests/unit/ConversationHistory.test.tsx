/**
 * The assistant's conversation list: shows which token started a
 * conversation and which ones wait for approval, and opens one on click.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationHistory } from '../../src/components/ai/ConversationHistory';
import type { Conversation } from '../../src/api/services/ai-chat.service';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown> | string) =>
      typeof options === 'object' && options?.name ? `${key}:${options.name}` : key,
    i18n: { language: 'en' },
  }),
}));

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
