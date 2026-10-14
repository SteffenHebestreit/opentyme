/**
 * The shared confirmation dialog is announced with its question and
 * explanation, as an alertdialog.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmHost } from '../../src/components/common/ConfirmHost';
import { confirmDialog } from '../../src/lib/confirm';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key, i18n: { language: 'en' } }),
}));

it('names the dialog by its title and describes it by its message', async () => {
  render(<ConfirmHost />);
  let answer: Promise<boolean> = Promise.resolve(false);
  act(() => {
    answer = confirmDialog({ title: 'Revoke this token?', message: 'Anything using it stops working.', tone: 'danger', confirmLabel: 'Revoke' });
  });

  const dialog = await screen.findByRole('alertdialog', { name: 'Revoke this token?' });
  expect(dialog).toHaveAccessibleDescription('Anything using it stops working.');

  await userEvent.setup().click(screen.getByRole('button', { name: 'Revoke' }));
  await expect(answer).resolves.toBe(true);
});
