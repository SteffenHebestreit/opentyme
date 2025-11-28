import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Header from '../../src/components/common/Header';
import { AppProvider } from '../../src/store/AppContext';

// Mock the AppContext
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
  useApp: () => ({
    state: mockState,
    dispatch: mockDispatch,
  }),
}));

// Wrapper component for tests
const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <AppProvider>{children}</AppProvider>
  </BrowserRouter>
);

describe('Header Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.theme = 'light';
  });

  it('renders the header', () => {
    render(<Header />, { wrapper: Wrapper });

    // Check that header is rendered
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('displays the logo/brand link', () => {
    render(<Header />, { wrapper: Wrapper });

    const logo = screen.getByRole('link', { name: /project tracker/i });
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('href', '/');
  });

  it('displays moon icon when theme is light', () => {
    mockState.theme = 'light';
    render(<Header />, { wrapper: Wrapper });

    const themeButton = screen.getByRole('button', { name: /toggle theme/i });
    expect(themeButton).toBeInTheDocument();

    // Moon icon has specific path for dark mode toggle
    const moonIcon = themeButton.querySelector('svg path[d*="21.752"]');
    expect(moonIcon).toBeInTheDocument();
  });

  it('displays sun icon when theme is dark', () => {
    mockState.theme = 'dark';
    render(<Header />, { wrapper: Wrapper });

    const themeButton = screen.getByRole('button', { name: /toggle theme/i });
    expect(themeButton).toBeInTheDocument();

    // Sun icon has specific path for light mode toggle
    const sunIcon = themeButton.querySelector('svg path[d*="M12 3v2.25"]');
    expect(sunIcon).toBeInTheDocument();
  });

  it('toggles theme from light to dark', async () => {
    const user = userEvent.setup();
    mockState.theme = 'light';
    render(<Header />, { wrapper: Wrapper });

    const themeButton = screen.getByRole('button', { name: /toggle theme/i });
    await user.click(themeButton);

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_THEME',
      payload: 'dark',
    });
  });

  it('toggles theme from dark to light', async () => {
    const user = userEvent.setup();
    mockState.theme = 'dark';
    render(<Header />, { wrapper: Wrapper });

    const themeButton = screen.getByRole('button', { name: /toggle theme/i });
    await user.click(themeButton);

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_THEME',
      payload: 'light',
    });
  });

  it('has accessible theme toggle button', () => {
    render(<Header />, { wrapper: Wrapper });

    const themeButton = screen.getByRole('button', { name: /toggle theme/i });
    expect(themeButton).toHaveAccessibleName();
  });

  it('applies dark mode styles when theme is dark', () => {
    mockState.theme = 'dark';
    render(<Header />, { wrapper: Wrapper });

    const header = screen.getByRole('banner');
    expect(header.className).toContain('dark:bg-gray-800');
  });

  it('applies light mode styles when theme is light', () => {
    mockState.theme = 'light';
    render(<Header />, { wrapper: Wrapper });

    const header = screen.getByRole('banner');
    expect(header.className).toContain('bg-white');
  });

  it('renders navigation area', () => {
    render(<Header />, { wrapper: Wrapper });

    // Navigation is hidden on mobile (md:flex)
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
    expect(nav.className).toContain('md:flex');
  });

  it('hides navigation on mobile', () => {
    render(<Header />, { wrapper: Wrapper });

    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('hidden');
    expect(nav.className).toContain('md:flex');
  });

  it('logo has correct styling', () => {
    render(<Header />, { wrapper: Wrapper });

    const logo = screen.getByRole('link', { name: /project tracker/i });
    expect(logo.className).toContain('text-indigo-600');
    expect(logo.className).toContain('dark:text-indigo-400');
    expect(logo.className).toContain('font-bold');
  });

  it('theme button has hover styles', () => {
    render(<Header />, { wrapper: Wrapper });

    const themeButton = screen.getByRole('button', { name: /toggle theme/i });
    expect(themeButton.className).toContain('hover:bg-gray-100');
    expect(themeButton.className).toContain('dark:hover:bg-gray-700');
  });

  it('dispatches theme action only once per click', async () => {
    const user = userEvent.setup();
    render(<Header />, { wrapper: Wrapper });

    const themeButton = screen.getByRole('button', { name: /toggle theme/i });

    await user.click(themeButton);
    expect(mockDispatch).toHaveBeenCalledTimes(1);

    await user.click(themeButton);
    expect(mockDispatch).toHaveBeenCalledTimes(2);
  });
});
