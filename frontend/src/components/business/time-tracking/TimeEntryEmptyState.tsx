import { FC } from 'react';
import { Clock8 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../common/Button';

/**
 * Empty state component for the time entries list.
 *
 * **Features:**
 * - Centered layout with dashed border
 * - Clock icon in indigo circle
 * - Descriptive message about tracking time
 * - Call-to-action button
 * - Dark mode support
 *
 * **Usage:**
 * Display when no time entries exist to guide users to create their first entry.
 *
 * @component
 * @example
 * <TimeEntryEmptyState
 *   onCreate={() => setShowCreateModal(true)}
 * />
 *
 * @example
 * // Conditional rendering
 * {timeEntries.length === 0 ? (
 *   <TimeEntryEmptyState onCreate={handleLogTime} />
 * ) : (
 *   <TimeEntryTable entries={timeEntries} />
 * )}
 */

/**
 * Props for the TimeEntryEmptyState component.
 *
 * @interface TimeEntryEmptyStateProps
 * @property {() => void} onCreate - Callback when create button is clicked
 */
interface TimeEntryEmptyStateProps {
  onCreate: () => void;
}

export const TimeEntryEmptyState: FC<TimeEntryEmptyStateProps> = ({ onCreate }) => {
  const { t } = useTranslation('time-tracking');
  
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10">
        <Clock8 className="h-8 w-8" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('empty.title')}</h3>
        <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">
          {t('empty.message')}
        </p>
      </div>
      <Button type="button" onClick={onCreate}>
        {t('addEntry')}
      </Button>
    </div>
  );
};
