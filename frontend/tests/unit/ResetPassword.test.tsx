import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import ResetPassword from '../../src/pages/auth/ResetPassword';

// Mock useNavigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Mock fetch
global.fetch = jest.fn();

describe('ResetPassword Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    // Always restore real timers so a test that enables fake timers can never
    // leak them into the next test (which would hang userEvent's typing delay).
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  it('renders reset password form with token in URL', () => {
    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-token-123']}>
        <ResetPassword />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument();
    expect(screen.getByText(/enter your new password below/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('New password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm new password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
  });

  it('displays error when token is missing from URL', () => {
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPassword />
      </MemoryRouter>
    );

    // The page shows the "token missing" message in both the form alert and the
    // fallback alert, so there can be more than one matching element.
    expect(screen.getAllByText(/password reset token is missing/i).length).toBeGreaterThan(0);
  });

  it('submits new password successfully', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Password reset successful' }),
    });

    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-token-123']}>
        <ResetPassword />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('New password'), 'NewPass123!');
    await user.type(screen.getByPlaceholderText('Confirm new password'), 'NewPass123!');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/password-reset/reset'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: 'valid-token-123', newPassword: 'NewPass123!' }),
        })
      );
    });
  });

  it('displays success message after successful password reset', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Password successfully reset' }),
    });

    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-token-123']}>
        <ResetPassword />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('New password'), 'NewPass123!');
    await user.type(screen.getByPlaceholderText('Confirm new password'), 'NewPass123!');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    // The page renders the server-provided message (here "Password successfully reset")
    await waitFor(() => {
      expect(screen.getByText(/successfully reset/i)).toBeInTheDocument();
    });
  });

  it('redirects to login after successful reset', async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Password successfully reset' }),
    });

    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-token-123']}>
        <ResetPassword />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('New password'), 'NewPass123!');
    await user.type(screen.getByPlaceholderText('Confirm new password'), 'NewPass123!');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    // The page navigates to /login after a 3s delay (real timers).
    await waitFor(
      () => {
        expect(mockNavigate).toHaveBeenCalledWith('/login');
      },
      { timeout: 4000 }
    );
  });

  it('displays error when passwords do not match', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-token-123']}>
        <ResetPassword />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('New password'), 'Password123!');
    await user.type(screen.getByPlaceholderText('Confirm new password'), 'DifferentPassword123!');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });

    // API should not be called
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not submit when fields are empty', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-token-123']}>
        <ResetPassword />
      </MemoryRouter>
    );

    // Both password inputs are HTML5 `required`, so the browser blocks submission
    // and no reset request is made for an empty form.
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('displays error message on server error', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Token expired or invalid' }),
    });

    render(
      <MemoryRouter initialEntries={['/reset-password?token=invalid-token']}>
        <ResetPassword />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('New password'), 'NewPass123!');
    await user.type(screen.getByPlaceholderText('Confirm new password'), 'NewPass123!');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/token expired or invalid/i)).toBeInTheDocument();
    });
  });

  it('displays network error message on fetch failure', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-token-123']}>
        <ResetPassword />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('New password'), 'NewPass123!');
    await user.type(screen.getByPlaceholderText('Confirm new password'), 'NewPass123!');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it('disables form during submission', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-token-123']}>
        <ResetPassword />
      </MemoryRouter>
    );

    const newPasswordInput = screen.getByPlaceholderText('New password');
    const confirmPasswordInput = screen.getByPlaceholderText('Confirm new password');
    const submitButton = screen.getByRole('button', { name: /reset password/i });

    await user.type(newPasswordInput, 'NewPass123!');
    await user.type(confirmPasswordInput, 'NewPass123!');
    await user.click(submitButton);

    // Check that form is disabled during loading
    expect(submitButton).toBeDisabled();
    expect(newPasswordInput).toBeDisabled();
    expect(confirmPasswordInput).toBeDisabled();
  });

  it('requires both password fields', () => {
    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-token-123']}>
        <ResetPassword />
      </MemoryRouter>
    );

    const newPasswordInput = screen.getByPlaceholderText('New password');
    const confirmPasswordInput = screen.getByPlaceholderText('Confirm new password');

    expect(newPasswordInput).toBeRequired();
    expect(confirmPasswordInput).toBeRequired();
    expect(newPasswordInput).toHaveAttribute('type', 'password');
    expect(confirmPasswordInput).toHaveAttribute('type', 'password');
  });

  it('clears previous error when retrying submission', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-token-123']}>
        <ResetPassword />
      </MemoryRouter>
    );

    // First attempt with mismatched passwords
    await user.type(screen.getByPlaceholderText('New password'), 'Pass1');
    await user.type(screen.getByPlaceholderText('Confirm new password'), 'Pass2');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });

    // Clear and retry
    await user.clear(screen.getByPlaceholderText('New password'));
    await user.clear(screen.getByPlaceholderText('Confirm new password'));
    await user.type(screen.getByPlaceholderText('New password'), 'Pass123!');
    await user.type(screen.getByPlaceholderText('Confirm new password'), 'Pass123!');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Success' }),
    });

    await user.click(screen.getByRole('button', { name: /reset password/i }));

    // Error should be cleared
    await waitFor(() => {
      expect(screen.queryByText(/passwords do not match/i)).not.toBeInTheDocument();
    });
  });
});
