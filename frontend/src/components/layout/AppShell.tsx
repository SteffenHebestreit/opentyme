import { ReactNode, useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { usePresence } from '../../hooks/ui/usePresence';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const COLLAPSE_KEY = 'sidebar-collapsed';

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Layout for signed-in pages: sidebar (collapsible on desktop, a drawer on
 * mobile), sticky top bar, and the page — which fades in on each section change.
 */
export function AppShell({ children, overlay }: { children: ReactNode; overlay?: ReactNode }) {
  const { t } = useTranslation('common');
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = usePresence(drawerOpen, 200);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, value ? '0' : '1');
      } catch {
        // not persisted — fine
      }
      return !value;
    });
  }, []);

  // Close the drawer on navigation and on Escape
  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  // Re-animate per section (/config/general → /config/email stays one section)
  const sectionKey = pathname.split('/')[1] || 'root';

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only z-[80] rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-lifted focus:not-sr-only focus:fixed focus:left-4 focus:top-3 dark:bg-gray-900 dark:text-white"
      >
        {t('shell.skipToContent', 'Skip to content')}
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden border-r border-gray-200/80 bg-white/70 backdrop-blur-xl transition-[width] duration-300 ease-out-expo lg:block',
          'dark:border-gray-800/80 dark:bg-gray-950/60',
          collapsed ? 'w-[68px]' : 'w-60'
        )}
      >
        <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>

      {/* Mobile drawer */}
      {drawer.mounted && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t('shell.mainNavigation', 'Main navigation')}>
          <div
            className={cn('absolute inset-0 bg-gray-950/40 backdrop-blur-[2px]', drawer.closing ? 'animate-fade-out' : 'animate-fade-in')}
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            className={cn(
              'absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-gray-200 bg-white shadow-overlay dark:border-gray-800 dark:bg-gray-950',
              drawer.closing ? 'animate-slide-out-left' : 'animate-slide-in-left'
            )}
          >
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
              aria-label={t('shell.closeMenu', 'Close menu')}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <Sidebar collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className={cn('flex min-h-screen flex-col transition-[padding] duration-300 ease-out-expo', collapsed ? 'lg:pl-[68px]' : 'lg:pl-60')}>
        <Topbar onOpenMenu={() => setDrawerOpen(true)} />
        <main id="main-content" className="flex-1 focus:outline-none" tabIndex={-1}>
          <div key={sectionKey} className="mx-auto w-full max-w-[1600px] animate-page-in px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>

      {overlay}
    </div>
  );
}
