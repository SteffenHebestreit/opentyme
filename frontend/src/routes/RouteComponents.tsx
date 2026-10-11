/**
 * @fileoverview Small components used by the route table (kept apart from
 * routes/index.tsx so that file only exports the router).
 */

import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { frontendPluginRegistry } from '@/plugins/plugin-registry';
import Layout from '@/components/common/Layout';
import AIChatWidget from '@/components/ai/AIChatWidget';
import { buttonClasses } from '@/components/common/buttonStyles';

/**
 * Renders the component registered by an addon for the current path.
 * Placed before the 404 catch-all so addon routes resolve correctly.
 */
export function PluginRoute() {
  const { t } = useTranslation('common');
  const { pathname } = useLocation();
  const routes = frontendPluginRegistry.getAllRoutes();
  const match = routes.find((r) => pathname === r.path || pathname.startsWith(r.path + '/'));

  if (!match) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">404</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
            {t('notFound.title', 'Page not found')}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {t('notFound.description', 'The page you are looking for does not exist.')}
          </p>
          <Link to="/dashboard" className={`mt-6 ${buttonClasses('primary')}`}>
            {t('notFound.back', 'Return to Dashboard')}
          </Link>
        </div>
      </div>
    );
  }

  const Component = match.component;
  return <Component />;
}

/** Redirect that keeps the query string (e.g. /invoices?wizard=start). */
export function RedirectKeepingQuery({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}

/**
 * Root layout component that renders Layout with Outlet for nested routes.
 * The AI chat widget is an overlay, so it keeps its state across pages.
 */
export function RootLayout() {
  return (
    <Layout overlay={<AIChatWidget />}>
      <Outlet />
    </Layout>
  );
}
