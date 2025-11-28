import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginForm } from '../LoginForm';
import { useAuth } from '../../../api/hooks/useAuth';

// Mock the useAuth hook
jest.mock('../../../api/hooks/useAuth');

// Mock router
const MockedRouter = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

// Create a test wrapper with providers
const createTestWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MockedRouter>{children}</MockedRouter>
    </QueryClientProvider>
  );
};

describe('LoginForm', () => {
  const mockLogin = jest.fn();
  const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      login: mockLogin,
      logout: jest.fn(),
      register: jest.fn(),
      updateProfile: jest.fn(),
      isLoading: false,
      error: null,
    });
    mockLogin.mockClear();
  });

  it('renders login form with email and password fields', () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <LoginForm />
      </Wrapper>
    );

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('displays validation errors for empty fields', async () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <LoginForm />
      </Wrapper>
    );

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  it('displays validation error for invalid email format', async () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <LoginForm />
      </Wrapper>
    );

    const emailInput = screen.getByLabelText(/email/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await userEvent.type(emailInput, 'invalid-email');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/please enter a valid email/i)).toBeInTheDocument();
    });
  });

  it('displays validation error for short password', async () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <LoginForm />
      </Wrapper>
    );

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await userEvent.type(emailInput, 'test@example.com');
    await userEvent.type(passwordInput, '123');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/password must be at least 6 characters/i)).toBeInTheDocument();
    });
  });

  it('calls login function with correct credentials on valid form submission', async () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <LoginForm />
      </Wrapper>
    );

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await userEvent.type(emailInput, 'test@example.com');
    await userEvent.type(passwordInput, 'password123');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  it('shows loading state when authentication is in progress', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      login: mockLogin,
      logout: jest.fn(),
      register: jest.fn(),
      updateProfile: jest.fn(),
      isLoading: true,
      error: null,
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <LoginForm />
      </Wrapper>
    );

    const submitButton = screen.getByRole('button', { name: /signing in/i });
    expect(submitButton).toBeDisabled();
    expect(screen.getByText(/signing in/i)).toBeInTheDocument();
  });

  it('displays authentication error when login fails', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      login: mockLogin,
      logout: jest.fn(),
      register: jest.fn(),
      updateProfile: jest.fn(),
      isLoading: false,
      error: 'Invalid credentials',
    });

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <LoginForm />
      </Wrapper>
    );

    expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
  });

  it('toggles password visibility when eye icon is clicked', async () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <LoginForm />
      </Wrapper>
    );

    const passwordInput = screen.getByLabelText(/password/i);
    const toggleButton = screen.getByRole('button', { name: /toggle password visibility/i });

    // Initially password should be hidden
    expect(passwordInput).toHaveAttribute('type', 'password');

    // Click to show password
    await userEvent.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'text');

    // Click to hide password again
    await userEvent.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('has a link to register page', () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <LoginForm />
      </Wrapper>
    );

    const registerLink = screen.getByRole('link', { name: /sign up/i });
    expect(registerLink).toBeInTheDocument();
    expect(registerLink).toHaveAttribute('href', '/register');
  });

  it('has a link to forgot password page', () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <LoginForm />
      </Wrapper>
    );

    const forgotPasswordLink = screen.getByRole('link', { name: /forgot.*password/i });
    expect(forgotPasswordLink).toBeInTheDocument();
    expect(forgotPasswordLink).toHaveAttribute('href', '/forgot-password');
  });

  it('prevents form submission when fields are invalid', async () => {
    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <LoginForm />
      </Wrapper>
    );

    const emailInput = screen.getByLabelText(/email/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    // Enter invalid email
    await userEvent.type(emailInput, 'invalid-email');
    await userEvent.click(submitButton);

    // Login should not be called with invalid data
    expect(mockLogin).not.toHaveBeenCalled();
  });
});