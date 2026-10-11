import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu } from 'lucide-react';
import { findNavItem } from './navigation';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { ActiveTimerIndicator } from './ActiveTimerIndicator';
import { SyncIndicator } from './SyncIndicator';
import { BrandMark } from './BrandLogo';

interface TopbarProps {
  onOpenMenu: () => void;
}

/** Sticky bar above the page: current section, running timer, sync state, theme, account. */
export function Topbar({ onOpenMenu }: TopbarProps) {
  const { t } = useTranslation('common');
  const { pathname } = useLocation();
  const section = findNavItem(pathname);
  const SectionIcon = section?.icon;

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/75 backdrop-blur-md supports-[backdrop-filter]:bg-white/60 dark:border-gray-800/80 dark:bg-gray-950/70 dark:supports-[backdrop-filter]:bg-gray-950/55">
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenMenu}
          className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-900/[0.05] hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 lg:hidden dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
          aria-label={t('shell.openMenu', 'Open menu')}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <BrandMark className="h-7 w-7 lg:hidden" />

        {section && SectionIcon && (
          <div key={section.to} className="hidden animate-fade-in items-center gap-2 text-sm font-medium text-gray-900 sm:flex dark:text-gray-100">
            <SectionIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
            {t(section.labelKey, section.fallback)}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <ActiveTimerIndicator />
          <SyncIndicator />
          <ThemeToggle />
          <div className="ml-1">
            <UserMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
