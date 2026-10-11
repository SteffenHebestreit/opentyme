import React, { ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface Tab {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: number;
}

/**
 * Props for the Tabs component.
 *
 * @property {Tab[]} tabs - Tab definitions
 * @property {string} activeTab - ID of the active tab
 * @property {(tabId: string) => void} onChange - Called with the clicked tab's ID
 * @property {'underline' | 'pills'} [variant='underline'] - Underlined tab bar or segmented pills
 */
interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'underline' | 'pills';
  className?: string;
}

/**
 * Tab bar with an indicator that slides to the active tab. Arrow keys move
 * between tabs; the bar scrolls horizontally on narrow screens.
 */
export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  className = '',
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => {
      const active = list.querySelector<HTMLElement>('[aria-selected="true"]');
      setIndicator(active ? { left: active.offsetLeft, width: active.offsetWidth } : null);
    };
    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(list);
    return () => observer?.disconnect();
  }, [activeTab, tabs]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const index = tabs.findIndex((tab) => tab.id === activeTab);
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    onChange(next.id);
    listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${next.id}"]`)?.focus();
    event.preventDefault();
  };

  const pills = variant === 'pills';

  return (
    <div
      className={cn(
        'scrollbar-none overflow-x-auto',
        !pills && 'border-b border-gray-200 dark:border-gray-800',
        className
      )}
    >
      <div
        ref={listRef}
        role="tablist"
        onKeyDown={onKeyDown}
        className={cn(
          'relative flex',
          pills ? 'inline-flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-900' : 'gap-6'
        )}
      >
        {indicator && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute transition-[left,width] duration-300 ease-out-expo',
              pills
                ? 'inset-y-1 rounded-md bg-white shadow-soft dark:bg-gray-800'
                : 'bottom-0 h-0.5 rounded-full bg-purple-600 dark:bg-purple-400'
            )}
            style={{ left: indicator.left, width: indicator.width }}
          />
        )}
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              data-tab-id={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative z-10 flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500',
                pills ? 'rounded-md px-3 py-1.5' : 'px-0.5 pb-3 pt-2',
                isActive
                  ? pills
                    ? 'text-gray-900 dark:text-white'
                    : 'text-purple-700 dark:text-purple-300'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
              )}
              role="tab"
              id={`${tab.id}-tab`}
              aria-selected={isActive}
              aria-controls={`${tab.id}-panel`}
              tabIndex={isActive ? 0 : -1}
            >
              {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className={cn(
                    'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                    isActive
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-200'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface TabPanelProps {
  tabId: string;
  activeTab: string;
  children: ReactNode;
  className?: string;
}

export const TabPanel: React.FC<TabPanelProps> = ({
  tabId,
  activeTab,
  children,
  className = '',
}) => {
  if (tabId !== activeTab) return null;

  return (
    <div
      role="tabpanel"
      id={`${tabId}-panel`}
      aria-labelledby={`${tabId}-tab`}
      className={cn('animate-fade-in', className)}
    >
      {children}
    </div>
  );
};
