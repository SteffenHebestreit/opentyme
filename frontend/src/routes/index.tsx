/**
 * @fileoverview React Router v6 Data API route configuration.
 *
 * Page components are code-split via route-level `lazy` so each page — and its
 * heavy dependencies (charts, pdfmake, exceljs) — loads on demand, keeping the
 * initial bundle small.
 *
 * @see https://reactrouter.com/start/data/routing
 * @module routes
 */

import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import type { ComponentType } from 'react';
import { frontendPluginRegistry } from '@/plugins/plugin-registry';

// Always-loaded shell (small, on every page)
import Layout from '@/components/common/Layout';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import AIChatWidget from '@/components/ai/AIChatWidget';
import { authGuardLoader } from './loaders/authGuardLoader';

/** Wraps a dynamic `import()` of a default-exported page into a React Router lazy module. */
const page = (factory: () => Promise<{ default: ComponentType<unknown> }>) => () =>
  factory().then((m) => ({ Component: m.default }));

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
 * Main router configuration using Data API. Page components are lazy-loaded.
 */
export const router = createBrowserRouter(
  [
    {
      path: '/',
      Component: RootLayout,
      ErrorBoundary,
      children: [
        // Public routes
        { index: true, lazy: page(() => import('@/pages/LandingPage')) },
        { path: 'login', lazy: page(() => import('@/pages/auth/Login')) },
        { path: 'register', lazy: page(() => import('@/pages/auth/Register')) },
        { path: 'forgot-password', lazy: page(() => import('@/pages/auth/ForgotPassword')) },
        { path: 'reset-password', lazy: page(() => import('@/pages/auth/ResetPassword')) },

        // Protected routes (require authentication)
        { path: 'dashboard', loader: authGuardLoader, lazy: page(() => import('@/components/dashboard/Dashboard')) },
        { path: 'profile', loader: authGuardLoader, lazy: page(() => import('@/pages/profile/ProfilePage')) },
        { path: 'clients', loader: authGuardLoader, lazy: page(() => import('@/components/business/clients/ClientList')) },
        { path: 'projects', loader: authGuardLoader, lazy: page(() => import('@/components/business/projects/ProjectList')) },
        { path: 'time-entries', loader: authGuardLoader, lazy: page(() => import('@/components/business/time-tracking/TimeEntryList')) },
        { path: 'finances', loader: authGuardLoader, lazy: page(() => import('@/pages/finances/FinancesPage')) },
        { path: 'reports', loader: authGuardLoader, lazy: page(() => import('@/pages/Reports')) },
        {
          path: 'config',
          loader: authGuardLoader,
          children: [
            { index: true, element: <Navigate to="general" replace /> },
            { path: ':tab', loader: authGuardLoader, lazy: page(() => import('@/pages/admin/AdminPage')) },
          ],
        },
        { path: 'system-admin', loader: authGuardLoader, lazy: page(() => import('@/pages/SystemAdmin')) },
        { path: 'email/compose', loader: authGuardLoader, lazy: page(() => import('@/pages/email/ComposeEmailPage')) },
        { path: 'email-templates/new', loader: authGuardLoader, lazy: page(() => import('@/pages/email-templates/EmailTemplateBuilder')) },
        { path: 'email-templates/:id', loader: authGuardLoader, lazy: page(() => import('@/pages/email-templates/EmailTemplateBuilder')) },

        // Backward compatibility redirects
        { path: 'invoices', element: <Navigate to="/finances" replace /> },
        { path: 'payments', element: <Navigate to="/finances" replace /> },

        // Addon routes + 404 catch-all
        { path: '*', loader: authGuardLoader, Component: PluginRoute },
      ],
    },
  ],
  {
    future: {
      v7_startTransition: true,
    },
  }
);
