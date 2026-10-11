import { FC } from 'react';
import { Clock8, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../common/Button';
import { EmptyState } from '../../common/EmptyState';

/**
 * Empty state component for the time entries list.
 *
 * **Features:**
 * - Centered layout with dashed border (shared EmptyState)
 * - Clock icon tile
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
    <EmptyState
      bordered
      icon={Clock8}
      title={t('empty.title')}
      description={t('empty.message')}
      action={
        <Button type="button" onClick={onCreate} leftIcon={<Plus className="h-4 w-4" />}>
          {t('addEntry')}
        </Button>
      }
    />
  );
};
