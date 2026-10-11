import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from '../../src/components/common/Layout';
import { AppProvider } from '../../src/store/AppContext';

// --- Mocks: auth, plugins, the running-timer query, i18n ---

const mockAuth = {
  isAuthenticated: false,
  isAdmin: false,
  user: { name: 'Ada Lovelace', email: 'ada@example.com', username: 'ada' } as unknown,
  logout: jest.fn(),
};

jest.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

jest.mock('../../src/api/hooks/usePlugins', () => ({
  usePlugins: () => ({ data: { plugins: [] } }),
}));

jest.mock('../../src/hooks/api/useTimeEntries', () => ({
  useTimeEntries: () => ({ data: [] }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en', resolvedLanguage: 'en', changeLanguage: jest.fn() },
  }),
}));

const renderAt = (path: string, children: React.ReactNode = <div>Page Content</div>) => {
  const router = createMemoryRouter([{ path: '*', element: <Layout>{children}</Layout> }], {
    initialEntries: [path],
  });
  return {
    router,
    ...render(
      <QueryClientProvider client={new QueryClient()}>
        <AppProvider>
          <RouterProvider router={router} />
        </AppProvider>
      </QueryClientProvider>
    ),
  };
};

describe('Layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.isAuthenticated = false;
    mockAuth.isAdmin = false;
    localStorage.clear();
  });

  describe('public pages', () => {
    it('renders the page inside main with the public header and footer', () => {
      renderAt('/login');
      expect(screen.getByRole('main')).toHaveTextContent('Page Content');
      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('contentinfo')).toHaveTextContent(/OpenTYME\. All rights reserved/);
    });

    it('shows no sidebar navigation', () => {
      renderAt('/login');
      expect(screen.queryByRole('navigation', { name: /main navigation/i })).not.toBeInTheDocument();
    });

    it('keeps the landing page public for signed-in users', () => {
      mockAuth.isAuthenticated = true;
      renderAt('/');
      expect(screen.queryByRole('navigation', { name: /main navigation/i })).not.toBeInTheDocument();
    });
  });

  describe('signed-in pages', () => {
    beforeEach(() => {
      mockAuth.isAuthenticated = true;
    });

    it('renders the sidebar with the main sections', () => {
      renderAt('/dashboard');
      const nav = screen.getAllByRole('navigation', { name: /main navigation/i })[0];
      // the i18n mock returns each label's English fallback
      for (const label of ['Dashboard', 'Time Tracking', 'Projects', 'Clients', 'Finances', 'Reports']) {
        expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
      }
    });

    it('marks the current section as active', () => {
      renderAt('/projects');
      const nav = screen.getAllByRole('navigation', { name: /main navigation/i })[0];
      expect(within(nav).getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page');
      expect(within(nav).getByRole('link', { name: 'Clients' })).not.toHaveAttribute('aria-current');
    });

    it('shows the system admin link only to admins', () => {
      const { unmount } = renderAt('/dashboard');
      expect(screen.queryByRole('link', { name: 'System Admin' })).not.toBeInTheDocument();
      unmount();

      mockAuth.isAdmin = true;
      renderAt('/dashboard');
      expect(screen.getByRole('link', { name: 'System Admin' })).toHaveAttribute('href', '/system-admin');
    });

    it('renders the page content in main', () => {
      renderAt('/dashboard', <section data-testid="page"><h1>Page Title</h1></section>);
      expect(within(screen.getByRole('main')).getByTestId('page')).toBeInTheDocument();
    });

    it('renders the overlay outside the page', () => {
      const router = createMemoryRouter(
        [{ path: '*', element: <Layout overlay={<div data-testid="overlay" />}><div>Page</div></Layout> }],
        { initialEntries: ['/dashboard'] }
      );
      render(
        <QueryClientProvider client={new QueryClient()}>
          <AppProvider>
            <RouterProvider router={router} />
          </AppProvider>
        </QueryClientProvider>
      );
      expect(screen.getByTestId('overlay')).toBeInTheDocument();
      expect(within(screen.getByRole('main')).queryByTestId('overlay')).not.toBeInTheDocument();
    });

    it('collapses the sidebar and remembers it', async () => {
      const user = userEvent.setup();
      renderAt('/dashboard');
      await user.click(screen.getByRole('button', { name: /collapse sidebar/i }));
      expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();
      expect(localStorage.getItem('sidebar-collapsed')).toBe('1');
    });

    it('opens the command palette with Ctrl+K and navigates to the chosen page', async () => {
      const user = userEvent.setup();
      const { router } = renderAt('/dashboard');
      // jsdom has no fetch Request, which data-router navigation needs — assert the call instead
      const navigate = jest.spyOn(router, 'navigate').mockResolvedValue(undefined);
      await user.keyboard('{Control>}k{/Control}');
      const palette = await screen.findByRole('dialog', { name: /quick navigation/i });
      await user.type(within(palette).getByRole('combobox'), 'proj');
      const options = within(palette).getAllByRole('option');
      expect(options[0]).toHaveTextContent('Projects');
      await user.keyboard('{Enter}');
      expect(navigate).toHaveBeenCalledWith('/projects', expect.anything());
    });

    it('opens the account menu with profile, settings and logout', async () => {
      const user = userEvent.setup();
      renderAt('/dashboard');
      await user.click(screen.getByRole('button', { name: /user menu/i }));
      const menu = screen.getByRole('menu');
      expect(within(menu).getByText('Ada Lovelace')).toBeInTheDocument();
      expect(within(menu).getByRole('menuitem', { name: /navigation.profile/ })).toHaveAttribute('href', '/profile');
      await user.click(within(menu).getByRole('menuitem', { name: /buttons.logout/ }));
      expect(mockAuth.logout).toHaveBeenCalledTimes(1);
    });
  });
});
