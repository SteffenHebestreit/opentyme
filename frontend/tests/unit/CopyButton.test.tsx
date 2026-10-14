/**
 * CopyButton copies its value and confirms it, visibly and to screen readers.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyButton } from '../../src/components/common/CopyButton';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const mockToastError = jest.fn();
jest.mock('../../src/lib/toast', () => ({ toast: { error: (...args: unknown[]) => mockToastError(...args) } }));

/** Call after userEvent.setup(): it installs its own clipboard stub on navigator. */
function setClipboard(writeText: jest.Mock) {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

afterEach(() => jest.useRealTimers());

it('copies the value and says so, then resets', async () => {
  jest.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const writeText = jest.fn().mockResolvedValue(undefined);
  setClipboard(writeText);
  render(<CopyButton value="oty_pat_secret" />);

  await user.click(screen.getByRole('button', { name: 'buttons.copy' }));
  expect(writeText).toHaveBeenCalledWith('oty_pat_secret');
  expect(await screen.findByRole('button', { name: 'buttons.copied' })).toBeInTheDocument();

  act(() => {
    jest.advanceTimersByTime(2100);
  });
  expect(screen.getByRole('button', { name: 'buttons.copy' })).toBeInTheDocument();
});

it('reports a failed copy instead of claiming success', async () => {
  const user = userEvent.setup();
  setClipboard(jest.fn().mockRejectedValue(new Error('denied')));
  render(<CopyButton value="x" label="Copy token" />);

  await user.click(screen.getByRole('button', { name: 'Copy token' }));
  expect(mockToastError).toHaveBeenCalledWith('messages.copyFailed');
  expect(screen.queryByRole('button', { name: 'buttons.copied' })).not.toBeInTheDocument();
});
