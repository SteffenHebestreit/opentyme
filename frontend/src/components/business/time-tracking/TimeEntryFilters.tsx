import { ChangeEvent, FC } from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from '../../forms';
import { fieldClasses } from '../../forms/fieldStyles';
import { cn } from '../../../lib/cn';
import { Button } from '../../common/Button';
import { Project } from '../../../api/types';

/**
 * Filter controls for the time entries list.
 *
 * **Features:**
 * - Text search by task description
 * - Project filter dropdown
 * - Date range filters (from/to dates)
 * - Search icon in search input
 * - Compact toolbar that wraps on small screens
 * - "Reset" button while any filter is set
 * - Dark mode support
 *
 * **Filter Options:**
 * - **Search**: Searches task descriptions
 * - **Project**: All projects or specific project
 * - **Date Range**: From date and To date
 *
 * @component
 * @example
 * <TimeEntryFilters
 *   search={searchQuery}
 *   projectId={selectedProjectId}
 *   startDate={fromDate}
 *   endDate={toDate}
 *   onSearchChange={setSearchQuery}
 *   onProjectChange={setSelectedProjectId}
 *   onStartDateChange={setFromDate}
 *   onEndDateChange={setToDate}
 *   projects={projects}
 * />
 *
 * @example
 * // With state management
 * const [filters, setFilters] = useState({
 *   search: '',
 *   projectId: '',
 *   startDate: '',
 *   endDate: '',
 * });
 *
 * <TimeEntryFilters
 *   {...filters}
 *   onSearchChange={(search) => setFilters({ ...filters, search })}
 *   onProjectChange={(projectId) => setFilters({ ...filters, projectId })}
 *   onStartDateChange={(startDate) => setFilters({ ...filters, startDate })}
 *   onEndDateChange={(endDate) => setFilters({ ...filters, endDate })}
 *   projects={projects}
 * />
 */

/**
 * Props for the TimeEntryFilters component.
 *
 * @interface TimeEntryFiltersProps
 * @property {string} search - Current search query
 * @property {(value: string) => void} onSearchChange - Callback when search changes
 * @property {string} projectId - Current selected project ID (empty for all)
 * @property {(projectId: string) => void} onProjectChange - Callback when project filter changes
 * @property {string} startDate - Start date filter (YYYY-MM-DD)
 * @property {string} endDate - End date filter (YYYY-MM-DD)
 * @property {(value: string) => void} onStartDateChange - Callback when start date changes
 * @property {(value: string) => void} onEndDateChange - Callback when end date changes
 * @property {Project[]} projects - Available projects for filtering
 */
interface TimeEntryFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  projectId: string;
  onProjectChange: (projectId: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  projects: Project[];
}

export const TimeEntryFilters: FC<TimeEntryFiltersProps> = ({
  search,
  onSearchChange,
  projectId,
  onProjectChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  projects,
}) => {
  const { t } = useTranslation('time-tracking');
  
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchChange(event.target.value);
  };

  const handleStartDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    onStartDateChange(event.target.value);
  };

  const handleEndDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    onEndDateChange(event.target.value);
  };

  // Project options for CustomSelect
  const projectOptions = [
    { value: '', label: t('filters.allProjects') },
    ...projects.map((project) => ({
      value: project.id,
      label: project.name,
    })),
  ];

  const hasFilters = Boolean(search || projectId || startDate || endDate);

  const handleReset = () => {
    onSearchChange('');
    onProjectChange('');
    onStartDateChange('');
    onEndDateChange('');
  };

  return (
    <div className="flex flex-wrap items-center gap-2" role="search">
      <div className="relative min-w-[14rem] flex-1 basis-full sm:basis-auto">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
          aria-hidden="true"
        />
        <input
          id="time-entry-search"
          type="search"
          placeholder={t('search')}
          aria-label={t('search')}
          value={search}
          onChange={handleSearchChange}
          autoComplete="off"
          className={cn(fieldClasses({ size: 'md' }), 'pl-9')}
        />
      </div>
      <div className="w-full sm:w-56">
        <CustomSelect
          value={projectId}
          onChange={onProjectChange}
          options={projectOptions}
          placeholder={t('filters.allProjects')}
          size="md"
        />
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <input
          id="time-entry-start-date"
          type="date"
          aria-label={t('filters.startDate')}
          title={t('filters.startDate')}
          value={startDate}
          onChange={handleStartDateChange}
          className={cn(fieldClasses({ size: 'md' }), 'min-w-0 flex-1 sm:w-40 sm:flex-none')}
        />
        <span className="text-sm text-gray-400 dark:text-gray-500" aria-hidden="true">
          –
        </span>
        <input
          id="time-entry-end-date"
          type="date"
          aria-label={t('filters.endDate')}
          title={t('filters.endDate')}
          value={endDate}
          onChange={handleEndDateChange}
          className={cn(fieldClasses({ size: 'md' }), 'min-w-0 flex-1 sm:w-40 sm:flex-none')}
        />
      </div>
      {hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          onClick={handleReset}
          leftIcon={<X className="h-4 w-4" />}
          className="h-10 animate-fade-in"
        >
          {t('filters.reset')}
        </Button>
      ) : null}
    </div>
  );
};
