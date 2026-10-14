import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Globe, LogIn, Pencil, Plus, RefreshCw, Trash2, type LucideIcon } from 'lucide-react';
import { useApiTokenEvents } from '../../../hooks/api/useApiTokens';
import type { ApiTokenEventType } from '../../../api/types';
import { SettingsSection } from '../SettingsSection';
import { formatDate, formatDistanceToNow } from '../../../utils/date';
import { cn } from '../../../lib/cn';

const ICONS: Record<ApiTokenEventType, LucideIcon> = {
  created: Plus,
  updated: Pencil,
  regenerated: RefreshCw,
  revoked: Trash2,
  first_use: LogIn,
  new_ip: Globe,
};

/** Use from a new address is worth a second look; the rest is routine. */
const TONE: Partial<Record<ApiTokenEventType, string>> = {
  new_ip: 'bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  revoked: 'bg-red-50 text-red-600 ring-red-600/10 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20',
};

/**
 * Recent token activity: what was changed, first use and use from new
 * addresses — including tokens that have been revoked since.
 */
export const ApiTokenActivity: FC = () => {
  const { t } = useTranslation('settings');
  const { data: events } = useApiTokenEvents();
  if (!events || events.length === 0) return null;

  return (
    <SettingsSection
      title={t('admin.apiTokens.activity.title')}
      description={t('admin.apiTokens.activity.description')}
      icon={Activity}
      bodyClassName="p-0 sm:p-0"
    >
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {events.map((event) => {
          const Icon = ICONS[event.event] ?? Activity;
          const showIp = event.ip && (event.event === 'first_use' || event.event === 'new_ip');
          return (
            <li key={event.id} className="flex items-start gap-3 px-5 py-3 sm:px-6">
              <span
                className={cn(
                  'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset',
                  TONE[event.event] ??
                    'bg-gray-50 text-gray-500 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800'
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800 dark:text-gray-200">
                  {t(`admin.apiTokens.activity.events.${event.event}`, { name: event.token_name })}
                  {showIp && (
                    <span className="text-gray-500 dark:text-gray-400">
                      {' '}
                      {t('admin.apiTokens.activity.fromIp', { ip: event.ip })}
                    </span>
                  )}
                </p>
                <p
                  className="mt-0.5 text-xs text-gray-500 dark:text-gray-400"
                  title={formatDate(event.created_at, { dateStyle: 'medium', timeStyle: 'short' })}
                >
                  {formatDistanceToNow(event.created_at)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </SettingsSection>
  );
};
