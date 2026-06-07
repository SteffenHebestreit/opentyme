import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Register from '../../src/pages/auth/Register';
import { authService } from '../../src/api/services/auth.service';

// Mock the authService (current path: api/services/auth.service)
jest.mock('../../src/api/services/auth.service', () => ({
  authService: {
    register: jest.fn(),
  },
}));

// Mock useNavigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe('Register Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders registration form', () => {
    render(<Register />, { wrapper: Wrapper });

    expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email address')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument();
  });

  it('handles successful registration', async () => {
    const user = userEvent.setup();

    (authService.register as jest.Mock).mockResolvedValue({ message: 'Registration successful! Please log in.' });

    render(<Register />, { wrapper: Wrapper });

    await user.type(screen.getByPlaceholderText('Username'), 'johndoe');
    await user.type(screen.getByPlaceholderText('Email address'), 'john@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'Password123!');
    await user.type(screen.getByPlaceholderText('Confirm Password'), 'Password123!');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    await waitFor(() => {
      expect(authService.register).toHaveBeenCalledWith({
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Password123!',
      });
      expect(mockNavigate).toHaveBeenCalledWith('/login', {
        state: { successMessage: 'Registration successful! Please log in.' },
      });
    });
  });

  it('displays error when passwords do not match', async () => {
    const user = userEvent.setup();

    render(<Register />, { wrapper: Wrapper });

    await user.type(screen.getByPlaceholderText('Username'), 'johndoe');
    await user.type(screen.getByPlaceholderText('Email address'), 'john@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'Password123!');
    await user.type(screen.getByPlaceholderText('Confirm Password'), 'DifferentPassword');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });

    expect(authService.register).not.toHaveBeenCalled();
  });

  it('does not submit when required fields are empty', async () => {
    const user = userEvent.setup();

    render(<Register />, { wrapper: Wrapper });

    // The inputs are HTML5 `required`, so the browser blocks submission and the
    // registration request is never made for an empty form.
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(authService.register).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('validates username format', async () => {
    const user = userEvent.setup();

    render(<Register />, { wrapper: Wrapper });

    await user.type(screen.getByPlaceholderText('Username'), 'john doe'); // space is invalid
    await user.type(screen.getByPlaceholderText('Email address'), 'john@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'Password123!');
    await user.type(screen.getByPlaceholderText('Confirm Password'), 'Password123!');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByText(/username can only contain/i)).toBeInTheDocument();
    });

    expect(authService.register).not.toHaveBeenCalled();
  });

  it('displays error message on registration failure', async () => {
    const user = userEvent.setup();
    const errorMessage = 'Email already exists';

    (authService.register as jest.Mock).mockRejectedValue({
      response: { data: { message: errorMessage } },
    });

    render(<Register />, { wrapper: Wrapper });

    await user.type(screen.getByPlaceholderText('Username'), 'johndoe');
    await user.type(screen.getByPlaceholderText('Email address'), 'existing@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'Password123!');
    await user.type(screen.getByPlaceholderText('Confirm Password'), 'Password123!');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it('disables form during submission', async () => {
    const user = userEvent.setup();

    (authService.register as jest.Mock).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 1000))
    );

    render(<Register />, { wrapper: Wrapper });

    await user.type(screen.getByPlaceholderText('Username'), 'johndoe');
    await user.type(screen.getByPlaceholderText('Email address'), 'john@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'Password123!');
    await user.type(screen.getByPlaceholderText('Confirm Password'), 'Password123!');

    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(screen.getByText(/creating account/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Username')).toBeDisabled();
  });

  it('navigates to login page when sign in link is clicked', async () => {
    const user = userEvent.setup();

    render(<Register />, { wrapper: Wrapper });

    const signInButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(signInButton);

    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('requires all fields', () => {
    render(<Register />, { wrapper: Wrapper });

    expect(screen.getByPlaceholderText('Username')).toBeRequired();
    expect(screen.getByPlaceholderText('Email address')).toBeRequired();
    expect(screen.getByPlaceholderText('Password')).toBeRequired();
    expect(screen.getByPlaceholderText('Confirm Password')).toBeRequired();
  });
});
