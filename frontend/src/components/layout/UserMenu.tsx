import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, LogOut, Monitor, Moon, Settings, Sun, UserRound } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useAuth } from '../../contexts/AuthContext';
import { useApp, type ColorVision, type ThemePreference } from '../../store/AppContext';
import { usePresence } from '../../hooks/ui/usePresence';

const LANGUAGES = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
];

const initialsOf = (name: string) =>
  name
    .split(/[\s._@-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

const itemClass =
  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white dark:focus-visible:bg-white/5';

/** Avatar button with profile, settings, theme, language and logout. */
export function UserMenu() {
  const { t, i18n } = useTranslation('common');
  const { user, logout } = useAuth();
  const { state, dispatch } = useApp();
  const [open, setOpen] = useState(false);
  const { mounted, closing } = usePresence(open, 120);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const displayName = user?.name || user?.username || user?.email || 'User';
  const language = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];

  const themeOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: t('shell.theme.light', 'Light'), icon: Sun },
    { value: 'dark', label: t('shell.theme.dark', 'Dark'), icon: Moon },
    { value: 'system', label: t('shell.theme.system', 'System'), icon: Monitor },
  ];
  const colorVisionOptions: { value: ColorVision; label: string; hint: string }[] = [
    { value: 'standard', label: t('shell.colorVision.standard'), hint: t('shell.colorVision.standardHint') },
    { value: 'redgreen', label: t('shell.colorVision.redgreen'), hint: t('shell.colorVision.redgreenHint') },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 items-center gap-2 rounded-full p-0.5 pr-0.5 transition-colors hover:bg-gray-900/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-white/[0.06]"
        aria-label="User menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-xs font-semibold text-white">
          {initialsOf(displayName)}
        </span>
      </button>

      {mounted && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-xl border border-gray-200 bg-white p-1.5 shadow-overlay',
            'dark:border-gray-800 dark:bg-gray-900',
            closing ? 'animate-scale-out' : 'animate-scale-in'
          )}
        >
          <div className="px-2.5 pb-2.5 pt-2">
            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{displayName}</p>
            {user?.email && user.email !== displayName && (
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
            )}
          </div>
          <div className="my-1 h-px bg-gray-100 dark:bg-gray-800" />

          <Link to="/profile" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            <UserRound className="h-4 w-4 text-gray-400" aria-hidden="true" />
            {t('navigation.profile')}
          </Link>
          <Link to="/config" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            <Settings className="h-4 w-4 text-gray-400" aria-hidden="true" />
            {t('navigation.settings')}
          </Link>

          <div className="my-1 h-px bg-gray-100 dark:bg-gray-800" />
          <p className="eyebrow px-2.5 pb-1 pt-1.5 text-[11px]">{t('shell.appearance', 'Appearance')}</p>
          <div className="mx-1 mb-1 grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-950/60">
            {themeOptions.map(({ value, label, icon: Icon }) => {
              const active = state.themePreference === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => dispatch({ type: 'SET_THEME', payload: value })}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition-all',
                    active
                      ? 'bg-white text-gray-900 shadow-soft dark:bg-gray-800 dark:text-white'
                      : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                  )}
                  aria-pressed={active}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>

          <p className="eyebrow px-2.5 pb-1 pt-2 text-[11px]">{t('shell.colorVision.title')}</p>
          {colorVisionOptions.map(({ value, label, hint }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={state.colorVision === value}
              className={itemClass}
              onClick={() => dispatch({ type: 'SET_COLOR_VISION', payload: value })}
            >
              <span className="flex min-w-0 flex-1 flex-col text-left">
                <span>{label}</span>
                <span className="text-[11px] leading-4 text-gray-500 dark:text-gray-400">{hint}</span>
              </span>
              {state.colorVision === value && (
                <Check className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
              )}
            </button>
          ))}

          <p className="eyebrow px-2.5 pb-1 pt-2 text-[11px]">{t('language.title')}</p>
          {LANGUAGES.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              role="menuitemradio"
              aria-checked={language === code}
              className={itemClass}
              onClick={() => {
                void i18n.changeLanguage(code);
                setOpen(false);
              }}
            >
              <span className="w-4 text-center text-[11px] font-semibold uppercase text-gray-400">{code}</span>
              <span className="flex-1">{label}</span>
              {language === code && <Check className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />}
            </button>
          ))}

          <div className="my-1 h-px bg-gray-100 dark:bg-gray-800" />
          <button
            type="button"
            role="menuitem"
            className={cn(itemClass, 'hover:text-red-600 dark:hover:text-red-400')}
            onClick={() => {
              setOpen(false);
              logout();
            }}
          >
            <LogOut className="h-4 w-4 text-gray-400" aria-hidden="true" />
            {t('buttons.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
