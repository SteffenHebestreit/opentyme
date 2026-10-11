import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Header from '../../src/components/common/Header';

// --- Mock app + auth + i18n dependencies the public Header relies on ---

const mockDispatch = jest.fn();
const mockState = {
  theme: 'light' as 'light' | 'dark',
  themePreference: 'light' as 'light' | 'dark' | 'system',
  user: null,
  isAuthenticated: false,
};

jest.mock('../../src/store/AppContext', () => ({
  ...jest.requireActual('../../src/store/AppContext'),
  useApp: () => ({ state: mockState, dispatch: mockDispatch }),
}));

const mockAuth = {
  isAuthenticated: false,
  user: null as unknown,
  isAdmin: false,
  logout: jest.fn(),
};

jest.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
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

describe('Header (public pages)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.theme = 'light';
    mockAuth.isAuthenticated = false;
  });

  it('renders the header banner', () => {
    render(<Header />, { wrapper: Wrapper });
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('links the brand to "/" when unauthenticated', () => {
    render(<Header />, { wrapper: Wrapper });
    expect(screen.getByRole('link', { name: /opentyme/i })).toHaveAttribute('href', '/');
  });

  it('links the brand to /dashboard when authenticated', () => {
    mockAuth.isAuthenticated = true;
    render(<Header />, { wrapper: Wrapper });
    expect(screen.getByRole('link', { name: /opentyme/i })).toHaveAttribute('href', '/dashboard');
  });

  it('offers sign-in when unauthenticated and the dashboard when signed in', () => {
    const { rerender } = render(<Header />, { wrapper: Wrapper });
    expect(screen.getByRole('link', { name: 'buttons.login' })).toHaveAttribute('href', '/login');

    mockAuth.isAuthenticated = true;
    rerender(<Header />);
    expect(screen.getByRole('link', { name: /navigation.dashboard/ })).toHaveAttribute('href', '/dashboard');
  });

  it('renders an accessible theme toggle button', () => {
    render(<Header />, { wrapper: Wrapper });
    expect(screen.getByRole('button', { name: /toggle theme/i })).toHaveAccessibleName();
  });

  it('switches from light to dark', async () => {
    const user = userEvent.setup();
    render(<Header />, { wrapper: Wrapper });
    await user.click(screen.getByRole('button', { name: /toggle theme/i }));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_THEME', payload: 'dark' });
  });

  it('switches from dark to light', async () => {
    mockState.theme = 'dark';
    const user = userEvent.setup();
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

  it('has no app navigation — signed-in pages use the sidebar shell', () => {
    mockAuth.isAuthenticated = true;
    render(<Header />, { wrapper: Wrapper });
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
