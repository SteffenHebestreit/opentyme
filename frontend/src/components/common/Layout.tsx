import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Header from './Header';
import { Toaster } from './Toaster';
import { ConfirmHost } from './ConfirmHost';
import { AppShell } from '../layout/AppShell';
import { RouteProgress } from '../layout/RouteProgress';

/**
 * Props for the Layout component.
 *
 * @property {React.ReactNode} children - Page content
 * @property {React.ReactNode} [overlay] - Rendered once outside the page (e.g. the AI chat widget), so it survives page changes
 */
interface LayoutProps {
  children: React.ReactNode;
  overlay?: React.ReactNode;
}

/** Pages shown without the app's sidebar, signed in or not. */
const PUBLIC_PATHS = new Set(['/', '/login', '/register', '/forgot-password', '/reset-password']);

/**
 * Root layout: the sidebar shell for signed-in pages, a simple header/footer
 * frame for public ones. Also hosts app-wide UI — route progress, toasts and
 * confirmation dialogs.
 *
 * @component
 * @param {LayoutProps} props - Component props
 * @returns {JSX.Element} Page frame around the routed content
 */
export default function Layout({ children, overlay }: LayoutProps) {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const isPublic = !isAuthenticated || PUBLIC_PATHS.has(pathname);

  return (
    <>
      <RouteProgress />
      {/* Faint brand glow behind the top of every page */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgb(124_58_237/0.07),transparent)] dark:bg-[radial-gradient(60%_100%_at_50%_0%,rgb(139_92_246/0.10),transparent)]"
        aria-hidden="true"
      />

      {isPublic ? (
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="relative flex-grow">
            <div key={pathname} className="animate-page-in">
              {children}
            </div>
          </main>
          <footer className="border-t border-gray-200/70 py-6 dark:border-gray-800/70">
            <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 text-sm text-gray-500 sm:flex-row sm:px-6 dark:text-gray-400">
              <p className="font-medium text-gray-700 dark:text-gray-300">Track Your Money &amp; Effort</p>
              <p>&copy; {new Date().getFullYear()} OpenTYME. All rights reserved.</p>
            </div>
          </footer>
        </div>
      ) : (
        <AppShell overlay={overlay}>{children}</AppShell>
      )}

      <Toaster />
      <ConfirmHost />
    </>
  );
}
