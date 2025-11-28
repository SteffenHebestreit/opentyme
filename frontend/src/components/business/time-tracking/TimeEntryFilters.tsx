import { ChangeEvent, FC } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input, CustomSelect } from '../../forms';
import { Project } from '../../../api/types';

/**
 * Filter controls for the time entries list.
 *
 * **Features:**
 * - Text search by task description
 * - Project filter dropdown
 * - Date range filters (from/to dates)
 * - Search icon in search input
 * - Responsive layout (stacked mobile, grid desktop)
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

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="flex w-full flex-1 items-center gap-3">
        <div className="w-full xl:max-w-sm">
          <Input
            id="time-entry-search"
            type="search"
            placeholder={t('search')}
            value={search}
            onChange={handleSearchChange}
            leftIcon={<Search className="h-4 w-4" />}
            inputSize="md"
            autoComplete="off"
          />
        </div>
      </div>
      <div className="grid w-full gap-3 md:grid-cols-2 xl:w-auto xl:grid-cols-4">
        <div>
          <CustomSelect
            label={t('filters.project')}
            value={projectId}
            onChange={onProjectChange}
            options={projectOptions}
            size="sm"
          />
        </div>
        <Input
          id="time-entry-start-date"
          label={t('filters.startDate')}
          type="date"
          value={startDate}
          onChange={handleStartDateChange}
          inputSize="sm"
        />
        <Input
          id="time-entry-end-date"
          label={t('filters.endDate')}
          type="date"
          value={endDate}
          onChange={handleEndDateChange}
          inputSize="sm"
        />
      </div>
    </div>
  );
};
