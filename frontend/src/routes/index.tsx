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

import { createBrowserRouter, Navigate } from 'react-router-dom';
import type { ComponentType } from 'react';

// Always-loaded shell (small, on every page)
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { PluginRoute, RedirectKeepingQuery, RootLayout } from './RouteComponents';
import { authGuardLoader } from './loaders/authGuardLoader';

/** Wraps a dynamic `import()` of a default-exported page into a React Router lazy module. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route pages take no props; any admits every component signature
const page = (factory: () => Promise<{ default: ComponentType<any> }>) => () =>
  factory().then((m) => ({ Component: m.default }));

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
        // OAuth consent for MCP clients (e.g. claude.ai connectors)
        { path: 'oauth/authorize', loader: authGuardLoader, lazy: page(() => import('@/pages/oauth/OAuthAuthorizePage')) },
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
        { path: 'invoices', element: <RedirectKeepingQuery to="/finances" /> },
        { path: 'payments', element: <RedirectKeepingQuery to="/finances" /> },

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
