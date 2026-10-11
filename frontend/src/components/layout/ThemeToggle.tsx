import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../store/AppContext';
import { cn } from '../../lib/cn';

/** Switches between light and dark (the shown theme, whatever the preference). */
export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation('common');
  const { state, dispatch } = useApp();
  const dark = state.theme === 'dark';

  return (
    <button
      type="button"
      onClick={() => dispatch({ type: 'SET_THEME', payload: dark ? 'light' : 'dark' })}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-900/[0.05] hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white',
        className
      )}
      aria-label={t('shell.toggleTheme', 'Toggle theme')}
      title={dark ? t('shell.theme.light', 'Light') : t('shell.theme.dark', 'Dark')}
    >
      <Sun
        className={cn('absolute h-[18px] w-[18px] transition-all duration-300', dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0')}
        aria-hidden="true"
      />
      <Moon
        className={cn('absolute h-[18px] w-[18px] transition-all duration-300', dark ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100')}
        aria-hidden="true"
      />
    </button>
  );
}
