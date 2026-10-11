import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronsLeft, Puzzle } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useAuth } from '../../contexts/AuthContext';
import { BrandLogo } from './BrandLogo';
import { primaryNav, secondaryNav, type NavItem } from './navigation';
import { usePluginNavItems } from './usePluginNavItems';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  /** Called after a link was followed (closes the mobile drawer). */
  onNavigate?: () => void;
  className?: string;
}

const linkClasses = (active: boolean, collapsed: boolean) =>
  cn(
    'group relative flex items-center gap-3 rounded-lg text-sm font-medium outline-none transition-colors duration-150',
    'focus-visible:ring-2 focus-visible:ring-brand-500',
    collapsed ? 'h-10 w-10 justify-center' : 'h-9 px-2.5',
    active
      ? 'bg-gray-900/[0.05] text-gray-900 dark:bg-white/[0.07] dark:text-white'
      : 'text-gray-600 hover:bg-gray-900/[0.04] hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.04] dark:hover:text-gray-100'
  );

function SidebarLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation('common');
  const label = t(item.labelKey, item.fallback);
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) => linkClasses(isActive, collapsed)}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              aria-hidden="true"
              className={cn(
                'absolute rounded-full bg-brand-600 animate-fade-in dark:bg-brand-400',
                collapsed ? '-left-3 top-2 h-6 w-[3px]' : '-left-3 top-1.5 h-6 w-[3px]'
              )}
            />
          )}
          <Icon
            className={cn(
              'h-[18px] w-[18px] shrink-0 transition-colors',
              isActive ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300'
            )}
            aria-hidden="true"
          />
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  );
}

/**
 * Primary navigation: sections, installed addons, settings.
 * Used as the fixed desktop sidebar and inside the mobile drawer.
 */
export function Sidebar({ collapsed, onToggleCollapsed, onNavigate, className }: SidebarProps) {
  const { t } = useTranslation('common');
  const { isAdmin } = useAuth();
  const pluginNavItems = usePluginNavItems();

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className={cn('flex h-14 shrink-0 items-center', collapsed ? 'justify-center' : 'px-4')}>
        <Link
          to="/dashboard"
          onClick={onNavigate}
          className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="OpenTYME"
        >
          <BrandLogo compact={collapsed} />
        </Link>
      </div>

      <nav
        className={cn('scrollbar-none flex-1 overflow-y-auto py-3', collapsed ? 'flex flex-col items-center px-2' : 'px-3')}
        aria-label={t('shell.mainNavigation', 'Main navigation')}
      >
        <div className={cn('space-y-0.5', collapsed && 'flex flex-col items-center')}>
          {primaryNav.map((item) => (
            <SidebarLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>

        {pluginNavItems.length > 0 && (
          <div className={cn('mt-6', collapsed && 'flex flex-col items-center')}>
            {!collapsed ? (
              <p className="eyebrow mb-1.5 px-2.5 text-[11px]">{t('shell.addons', 'Addons')}</p>
            ) : (
              <div className="mx-auto mb-3 h-px w-6 bg-gray-200 dark:bg-gray-800" />
            )}
            <div className={cn('space-y-0.5', collapsed && 'flex flex-col items-center')}>
              {pluginNavItems.map((route) => (
                <NavLink
                  key={route.path}
                  to={route.path}
                  onClick={onNavigate}
                  title={collapsed ? route.menuItem!.label : undefined}
                  className={({ isActive }) => linkClasses(isActive, collapsed)}
                >
                  <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-base leading-none" aria-hidden="true">
                    {route.menuItem!.icon || <Puzzle className="h-[18px] w-[18px]" />}
                  </span>
                  {!collapsed && <span className="truncate">{route.menuItem!.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </nav>

      <div className={cn('shrink-0 border-t border-gray-200/80 py-3 dark:border-gray-800/80', collapsed ? 'flex flex-col items-center px-2' : 'px-3')}>
        <div className={cn('space-y-0.5', collapsed && 'flex flex-col items-center')}>
          {secondaryNav
            .filter((item) => !item.adminOnly || isAdmin)
            .map((item) => (
              <SidebarLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
        </div>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              'mt-2 flex items-center gap-3 rounded-lg text-sm text-gray-400 transition-colors hover:bg-gray-900/[0.04] hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-white/[0.04] dark:hover:text-gray-200',
              collapsed ? 'h-10 w-10 justify-center' : 'h-9 w-full px-2.5'
            )}
            aria-label={collapsed ? t('shell.expandSidebar', 'Expand sidebar') : t('shell.collapseSidebar', 'Collapse sidebar')}
            title={collapsed ? t('shell.expandSidebar', 'Expand sidebar') : undefined}
          >
            <ChevronsLeft
              className={cn('h-[18px] w-[18px] shrink-0 transition-transform duration-300', collapsed && 'rotate-180')}
              aria-hidden="true"
            />
            {!collapsed && <span>{t('shell.collapseSidebar', 'Collapse sidebar')}</span>}
          </button>
        )}
      </div>
    </div>
  );
}
