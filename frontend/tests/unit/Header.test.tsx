import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Header from '../../src/components/common/Header';

// --- Mock app + auth + plugin + i18n dependencies the Header relies on ---

const mockDispatch = jest.fn();
const mockState = {
  theme: 'light' as 'light' | 'dark',
  user: null,
  isAuthenticated: false,
  loading: false,
  error: null,
};

jest.mock('../../src/store/AppContext', () => ({
  ...jest.requireActual('../../src/store/AppContext'),
  useApp: () => ({ state: mockState, dispatch: mockDispatch }),
}));

const mockAuth = {
  isAuthenticated: false,
  user: null as any,
  isAdmin: false,
  logout: jest.fn(),
};

jest.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

jest.mock('../../src/api/hooks/usePlugins', () => ({
  usePlugins: () => ({ data: { plugins: [] } }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe('Header Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.theme = 'light';
    mockAuth.isAuthenticated = false;
    mockAuth.user = null;
    mockAuth.isAdmin = false;
  });

  it('renders the header banner', () => {
    render(<Header />, { wrapper: Wrapper });
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('displays the OpenTYME brand link to "/" when unauthenticated', () => {
    render(<Header />, { wrapper: Wrapper });
    const logo = screen.getByRole('link', { name: /opentyme/i });
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('href', '/');
  });

  it('links the brand to /dashboard when authenticated', () => {
    mockAuth.isAuthenticated = true;
    render(<Header />, { wrapper: Wrapper });
    const logo = screen.getByRole('link', { name: /opentyme/i });
    expect(logo).toHaveAttribute('href', '/dashboard');
  });

  it('renders an accessible theme toggle button', () => {
    render(<Header />, { wrapper: Wrapper });
    const themeButton = screen.getByRole('button', { name: /toggle theme/i });
    expect(themeButton).toBeInTheDocument();
    expect(themeButton).toHaveAccessibleName();
  });

  it('displays the moon icon when theme is light', () => {
    mockState.theme = 'light';
    render(<Header />, { wrapper: Wrapper });
    const themeButton = screen.getByRole('button', { name: /toggle theme/i });
    expect(themeButton.querySelector('svg path[d*="21.752"]')).toBeInTheDocument();
  });

  it('displays the sun icon when theme is dark', () => {
    mockState.theme = 'dark';
    render(<Header />, { wrapper: Wrapper });
    const themeButton = screen.getByRole('button', { name: /toggle theme/i });
    expect(themeButton.querySelector('svg path[d*="M12 3v2.25"]')).toBeInTheDocument();
  });

  it('toggles theme from light to dark', async () => {
    const user = userEvent.setup();
    mockState.theme = 'light';
    render(<Header />, { wrapper: Wrapper });

    await user.click(screen.getByRole('button', { name: /toggle theme/i }));

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_THEME', payload: 'dark' });
  });

  it('toggles theme from dark to light', async () => {
    const user = userEvent.setup();
    mockState.theme = 'dark';
    render(<Header />, { wrapper: Wrapper });

    await user.click(screen.getByRole('button', { name: /toggle theme/i }));

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_THEME', payload: 'light' });
  });

  it('dispatches the theme action once per click', async () => {
    const user = userEvent.setup();
    render(<Header />, { wrapper: Wrapper });

    const themeButton = screen.getByRole('button', { name: /toggle theme/i });
    await user.click(themeButton);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    await user.click(themeButton);
    expect(mockDispatch).toHaveBeenCalledTimes(2);
  });

  it('applies light-mode background classes when theme is light', () => {
    mockState.theme = 'light';
    render(<Header />, { wrapper: Wrapper });
    expect(screen.getByRole('banner').className).toContain('bg-white');
  });

  it('applies dark-mode background classes when theme is dark', () => {
    mockState.theme = 'dark';
    render(<Header />, { wrapper: Wrapper });
    expect(screen.getByRole('banner').className).toContain('bg-gray-900');
  });

  it('shows the desktop navigation (hidden on mobile) when authenticated', () => {
    mockAuth.isAuthenticated = true;
    render(<Header />, { wrapper: Wrapper });
    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('hidden');
    expect(nav.className).toContain('md:flex');
  });

  it('hides navigation when not authenticated', () => {
    mockAuth.isAuthenticated = false;
    render(<Header />, { wrapper: Wrapper });
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
