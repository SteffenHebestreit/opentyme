import { useEffect, useState } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * A small spinning icon while data refreshes in the background — the cue that
 * numbers on screen are being brought up to date. Appears only for fetches that
 * take longer than a moment, so quick ones don't make it flicker.
 */
export function SyncIndicator() {
  const { t } = useTranslation('common');
  const fetching = useIsFetching({ predicate: (query) => query.state.data !== undefined }) > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!fetching) {
      const hide = setTimeout(() => setVisible(false), 250);
      return () => clearTimeout(hide);
    }
    const show = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(show);
  }, [fetching]);

  return (
    <span
      className={cn(
        'flex h-9 w-9 items-center justify-center text-gray-400 transition-opacity duration-300 dark:text-gray-500',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      )}
      role="status"
      aria-live="polite"
      title={t('shell.syncing', 'Updating…')}
    >
      <RefreshCw className={cn('h-4 w-4', visible && 'animate-spin [animation-duration:1.2s]')} aria-hidden="true" />
      <span className="sr-only">{visible ? t('shell.syncing', 'Updating…') : ''}</span>
    </span>
  );
}
