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
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
  });

  it('displays error when token is missing from URL', () => {
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPassword />
      </MemoryRouter>
    );

    expect(screen.getByText(/password reset token is missing/i)).toBeInTheDocument();
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

    await user.type(screen.getByLabelText(/new password/i), 'NewPass123!');
    await user.type(screen.getByLabelText(/confirm password/i), 'NewPass123!');
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

    await user.type(screen.getByLabelText(/new password/i), 'NewPass123!');
    await user.type(screen.getByLabelText(/confirm password/i), 'NewPass123!');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/password has been successfully reset/i)).toBeInTheDocument();
    });
  });

  it('redirects to login after successful reset', async () => {
    const user = userEvent.setup();
    jest.useFakeTimers();
    
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Success' }),
    });

    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-token-123']}>
        <ResetPassword />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/new password/i), 'NewPass123!');
    await user.type(screen.getByLabelText(/confirm password/i), 'NewPass123!');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/password has been successfully reset/i)).toBeInTheDocument();
    });

    // Fast-forward timer to trigger navigation
    jest.advanceTimersByTime(3000);

    expect(mockNavigate).toHaveBeenCalledWith('/login');

    jest.useRealTimers();
  });

  it('displays error when passwords do not match', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-token-123']}>
        <ResetPassword />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/new password/i), 'Password123!');
    await user.type(screen.getByLabelText(/confirm password/i), 'DifferentPassword123!');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });

    // API should not be called
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('displays error when fields are empty', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-token-123']}>
        <ResetPassword />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/please fill in all fields/i)).toBeInTheDocument();
    });

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

    await user.type(screen.getByLabelText(/new password/i), 'NewPass123!');
    await user.type(screen.getByLabelText(/confirm password/i), 'NewPass123!');
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

    await user.type(screen.getByLabelText(/new password/i), 'NewPass123!');
    await user.type(screen.getByLabelText(/confirm password/i), 'NewPass123!');
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

    const newPasswordInput = screen.getByLabelText(/new password/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
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

    const newPasswordInput = screen.getByLabelText(/new password/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);

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
    await user.type(screen.getByLabelText(/new password/i), 'Pass1');
    await user.type(screen.getByLabelText(/confirm password/i), 'Pass2');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });

    // Clear and retry
    await user.clear(screen.getByLabelText(/new password/i));
    await user.clear(screen.getByLabelText(/confirm password/i));
    await user.type(screen.getByLabelText(/new password/i), 'Pass123!');
    await user.type(screen.getByLabelText(/confirm password/i), 'Pass123!');

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
