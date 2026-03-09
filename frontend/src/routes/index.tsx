/**
 * @fileoverview React Router v6 Data API route configuration.
 * 
 * Uses createBrowserRouter with loaders, actions, and error boundaries
 * for better data fetching and error handling patterns.
 * 
 * @see https://reactrouter.com/start/data/routing
 * @module routes
 */

import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { frontendPluginRegistry } from '@/plugins/plugin-registry';

// Layout
import Layout from '@/components/common/Layout';

// Error boundary
import ErrorBoundary from '@/components/common/ErrorBoundary';

// Auth pages
import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';
import ForgotPassword from '@/pages/auth/ForgotPassword';
import ResetPasswordPage from '@/pages/auth/ResetPassword';
import LandingPage from '@/pages/LandingPage';

// Main pages
import Dashboard from '@/components/dashboard/Dashboard';
import ProfilePage from '@/pages/profile/ProfilePage';
import ClientList from '@/components/business/clients/ClientList';
import ProjectList from '@/components/business/projects/ProjectList';
import TimeEntryList from '@/components/business/time-tracking/TimeEntryList';

// Finance & Admin pages
import FinancesPage from '@/pages/finances/FinancesPage';
import AdminPage from '@/pages/admin/AdminPage';
import SystemAdmin from '@/pages/SystemAdmin';

// Communication pages
import EmailTemplateBuilder from '@/pages/email-templates/EmailTemplateBuilder';
import ComposeEmailPage from '@/pages/email/ComposeEmailPage';

// Reports page
import Reports from '@/pages/Reports';

// Auth guard loader
import { authGuardLoader } from './loaders/authGuardLoader';

// AI Chat Widget (floating, present on every page)
import AIChatWidget from '@/components/ai/AIChatWidget';

/**
 * Renders the component registered by an addon for the current path.
 * Placed before the 404 catch-all so addon routes resolve correctly.
 */
function PluginRoute() {
  const { pathname } = useLocation();
  const routes = frontendPluginRegistry.getAllRoutes();
  const match = routes.find((r) => pathname === r.path || pathname.startsWith(r.path + '/'));

  if (!match) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">404</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">Page not found</p>
          <a href="/dashboard" className="text-purple-600 hover:text-purple-700 dark:text-purple-400">
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const Component = match.component;
  return <Component />;
}

/**
 * Root layout component that renders Layout with Outlet for nested routes
 */
function RootLayout() {
  return (
    <Layout>
      <Outlet />
      <AIChatWidget />
    </Layout>
  );
}

/**
 * Main router configuration using Data API
 */
export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    ErrorBoundary,
    children: [
      // Public routes
      {
        index: true,
        Component: LandingPage,
      },
      {
        path: 'login',
        Component: Login,
      },
      {
        path: 'register',
        Component: Register,
      },
      {
        path: 'forgot-password',
        Component: ForgotPassword,
      },
      {
        path: 'reset-password',
        Component: ResetPasswordPage,
      },

      // Protected routes (require authentication)
      {
        path: 'dashboard',
        loader: authGuardLoader,
        Component: Dashboard,
      },
      {
        path: 'profile',
        loader: authGuardLoader,
        Component: ProfilePage,
      },
      {
        path: 'clients',
        loader: authGuardLoader,
        Component: ClientList,
      },
      {
        path: 'projects',
        loader: authGuardLoader,
        Component: ProjectList,
      },
      {
        path: 'time-entries',
        loader: authGuardLoader,
        Component: TimeEntryList,
      },
      {
        path: 'finances',
        loader: authGuardLoader,
        Component: FinancesPage,
      },
      {
        path: 'reports',
        loader: authGuardLoader,
        Component: Reports,
      },
      {
        path: 'config',
        loader: authGuardLoader,
        children: [
          { index: true, element: <Navigate to="general" replace /> },
          { path: ':tab', loader: authGuardLoader, Component: AdminPage },
        ],
      },
      {
        path: 'system-admin',
        loader: authGuardLoader,
        Component: SystemAdmin,
      },
      {
        path: 'email/compose',
        loader: authGuardLoader,
        Component: ComposeEmailPage,
      },
      {
        path: 'email-templates/new',
        loader: authGuardLoader,
        Component: EmailTemplateBuilder,
      },
      {
        path: 'email-templates/:id',
        loader: authGuardLoader,
        Component: EmailTemplateBuilder,
      },

      // Backward compatibility redirects
      {
        path: 'invoices',
        element: <Navigate to="/finances" replace />,
      },
      {
        path: 'payments',
        element: <Navigate to="/finances" replace />,
      },

      // Addon routes + 404 catch-all
      // PluginRoute resolves paths registered by addons; falls back to 404
      {
        path: '*',
        loader: authGuardLoader,
        Component: PluginRoute,
      },
    ],
  },
], {
  future: {
    v7_startTransition: true,
  },
});
