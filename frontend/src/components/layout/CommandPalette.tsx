import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CornerDownLeft,
  Languages,
  LogOut,
  Monitor,
  Moon,
  Puzzle,
  Search,
  SlidersHorizontal,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { usePresence } from '../../hooks/ui/usePresence';
import { useAuth } from '../../contexts/AuthContext';
import { useApp, type ThemePreference } from '../../store/AppContext';
import { primaryNav, secondaryNav } from './navigation';
import { usePluginNavItems } from './usePluginNavItems';

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon | string;
  keywords?: string;
  run: () => void;
}

const SETTINGS_TABS: { id: string; labelKey: string; fallback: string }[] = [
  { id: 'general', labelKey: 'admin.tabs.general', fallback: 'General' },
  { id: 'tax-rates', labelKey: 'admin.tabs.taxRates', fallback: 'Tax rates' },
  { id: 'invoice-templates', labelKey: 'admin.tabs.templates', fallback: 'Invoice templates' },
  { id: 'email-templates', labelKey: 'admin.tabs.emailTemplates', fallback: 'Email templates' },
  { id: 'email', labelKey: 'admin.tabs.email', fallback: 'Email' },
  { id: 'theme', labelKey: 'admin.tabs.theme', fallback: 'Theme' },
  { id: 'plugins', labelKey: 'admin.tabs.plugins', fallback: 'Addons' },
];

const normalize = (value: string) => value.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Opens the command palette from anywhere: Ctrl/⌘ + K. */
export function useCommandPaletteShortcut(onOpen: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpen();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onOpen]);
}

/**
 * Quick switcher: jump to any section, settings tab or addon, switch theme or
 * language — typed, arrow keys, Enter.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');
  const navigate = useNavigate();
  const { isAdmin, logout } = useAuth();
  const { dispatch } = useApp();
  const pluginNavItems = usePluginNavItems();
  const { mounted, closing } = usePresence(open, 140);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (to: string) => () => {
      onClose();
      navigate(to);
    },
    [navigate, onClose]
  );

  const commands = useMemo<Command[]>(() => {
    const pages = t('shell.palette.pages', 'Pages');
    const settings = t('navigation.settings', 'Settings');
    const actions = t('shell.palette.actions', 'Actions');
    const setTheme = (value: ThemePreference) => () => {
      dispatch({ type: 'SET_THEME', payload: value });
      onClose();
    };

    return [
      ...[...primaryNav, ...secondaryNav]
        .filter((item) => !item.adminOnly || isAdmin)
        .map((item) => ({
          id: item.to,
          group: pages,
          label: t(item.labelKey, item.fallback),
          icon: item.icon,
          keywords: item.to,
          run: go(item.to),
        })),
      ...pluginNavItems.map((route) => ({
        id: route.path,
        group: pages,
        label: route.menuItem!.label,
        icon: route.menuItem!.icon || Puzzle,
        keywords: 'addon',
        run: go(route.path),
      })),
      ...SETTINGS_TABS.map((tab) => ({
        id: `/config/${tab.id}`,
        group: settings,
        label: tSettings(tab.labelKey, tab.fallback),
        hint: settings,
        icon: SlidersHorizontal,
        keywords: `config settings einstellungen ${tab.id}`,
        run: go(`/config/${tab.id}`),
      })),
      { id: 'theme-light', group: actions, label: t('shell.palette.themeLight', 'Switch to light theme'), icon: Sun, keywords: 'theme hell light', run: setTheme('light') },
      { id: 'theme-dark', group: actions, label: t('shell.palette.themeDark', 'Switch to dark theme'), icon: Moon, keywords: 'theme dunkel dark', run: setTheme('dark') },
      { id: 'theme-system', group: actions, label: t('shell.palette.themeSystem', 'Use system theme'), icon: Monitor, keywords: 'theme system auto', run: setTheme('system') },
      {
        id: 'language',
        group: actions,
        label: i18n.language?.startsWith('de') ? 'Switch to English' : 'Auf Deutsch umschalten',
        icon: Languages,
        keywords: 'language sprache deutsch english',
        run: () => {
          void i18n.changeLanguage(i18n.language?.startsWith('de') ? 'en' : 'de');
          onClose();
        },
      },
      {
        id: 'logout',
        group: actions,
        label: t('buttons.logout', 'Log out'),
        icon: LogOut,
        keywords: 'logout abmelden sign out',
        run: () => {
          onClose();
          logout();
        },
      },
    ];
  }, [t, tSettings, i18n, isAdmin, pluginNavItems, go, dispatch, onClose, logout]);

  const results = useMemo(() => {
    const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return commands;
    return commands.filter((command) => {
      const haystack = normalize(`${command.label} ${command.group} ${command.keywords ?? ''}`);
      return terms.every((term) => haystack.includes(term));
    });
  }, [commands, query]);

  // Reset when opened; focus the search field
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      setActive((index) => Math.min(results.length - 1, index + 1));
      event.preventDefault();
    } else if (event.key === 'ArrowUp') {
      setActive((index) => Math.max(0, index - 1));
      event.preventDefault();
    } else if (event.key === 'Enter') {
      results[active]?.run();
      event.preventDefault();
    } else if (event.key === 'Escape') {
      onClose();
      event.preventDefault();
    }
  };

  if (!mounted) return null;

  let lastGroup = '';

  return createPortal(
    <div className="fixed inset-0 z-[55] flex items-start justify-center px-4 pt-[12vh]" onKeyDown={onKeyDown}>
      <div
        className={cn('absolute inset-0 bg-gray-950/30 backdrop-blur-[2px] dark:bg-black/50', closing ? 'animate-fade-out' : 'animate-fade-in')}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('shell.palette.title', 'Quick navigation')}
        className={cn(
          'relative w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-overlay dark:border-gray-800 dark:bg-gray-900',
          closing ? 'animate-scale-out' : 'animate-scale-in'
        )}
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 dark:border-gray-800">
          <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('shell.palette.placeholder', 'Go to page or run an action…')}
            className="h-12 w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-white dark:placeholder:text-gray-500"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={results[active] ? `command-${results[active].id}` : undefined}
          />
          <kbd className="hidden rounded-md border border-gray-200 px-1.5 py-0.5 font-sans text-[11px] text-gray-400 sm:block dark:border-gray-700">Esc</kbd>
        </div>

        <div ref={listRef} id="command-palette-list" role="listbox" className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain p-1.5">
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {t('shell.palette.empty', 'Nothing found')}
            </p>
          )}
          {results.map((command, index) => {
            const header = command.group !== lastGroup ? command.group : null;
            lastGroup = command.group;
            const Icon = command.icon;
            const selected = index === active;
            return (
              <div key={command.id}>
                {header && <p className="eyebrow px-2.5 pb-1 pt-2.5 text-[11px]">{header}</p>}
                <button
                  type="button"
                  id={`command-${command.id}`}
                  data-index={index}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => setActive(index)}
                  onClick={command.run}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-75',
                    selected ? 'bg-gray-100 text-gray-900 dark:bg-white/[0.06] dark:text-white' : 'text-gray-700 dark:text-gray-300'
                  )}
                >
                  <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center', selected ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400')}>
                    {typeof Icon === 'string' ? <span className="text-sm leading-none">{Icon}</span> : <Icon className="h-4 w-4" aria-hidden="true" />}
                  </span>
                  <span className="flex-1 truncate">{command.label}</span>
                  {selected && <CornerDownLeft className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
