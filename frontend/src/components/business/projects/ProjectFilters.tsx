import { FC, ChangeEvent } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from '../../forms';
import { fieldClasses } from '../../forms/fieldStyles';
import { cn } from '../../../lib/cn';
import { Client } from '../../../api/types';

/**
 * Project status filter options.
 * @type {('all' | 'not_started' | 'active' | 'on_hold' | 'completed')}
 */
export type ProjectStatusFilter = 'all' | 'not_started' | 'active' | 'on_hold' | 'completed';

/**
 * Props for the ProjectFilters component.
 * 
 * @interface ProjectFiltersProps
 * @property {string} search - Current search query value
 * @property {ProjectStatusFilter} status - Currently selected status filter
 * @property {string} clientId - Currently selected client ID filter
 * @property {Client[]} clients - Available clients for filter dropdown
 * @property {(value: string) => void} onSearchChange - Callback when search changes
 * @property {(value: ProjectStatusFilter) => void} onStatusChange - Callback when status filter changes
 * @property {(clientId: string) => void} onClientChange - Callback when client filter changes
 */
interface ProjectFiltersProps {
  search: string;
  status: ProjectStatusFilter;
  clientId: string;
  clients: Client[];
  onSearchChange: (value: string) => void;
  onStatusChange: (value: ProjectStatusFilter) => void;
  onClientChange: (clientId: string) => void;
}

/**
 * Available status filter options.
 * @constant
 */
const getStatusOptions = (t: (key: string) => string): Array<{ label: string; value: ProjectStatusFilter }> => [
  { label: t('status.all'), value: 'all' },
  { label: t('status.notStarted'), value: 'not_started' },
  { label: t('status.active'), value: 'active' },
  { label: t('status.onHold'), value: 'on_hold' },
  { label: t('status.completed'), value: 'completed' },
];

/**
 * Project filtering component with search, status, and client filters.
 * 
 * Features:
 * - Search input with magnifying glass icon
 * - Status dropdown (all, not_started, active, on_hold, completed)
 * - Client dropdown with all available clients
 * - Compact one-row toolbar (stacked on mobile)
 * - Dark mode support
 * - Controlled component pattern
 * 
 * All filters trigger callbacks to parent component for state management.
 * Useful for filtering project lists and tables.
 * 
 * @component
 * @example
 * <ProjectFilters
 *   search={searchQuery}
 *   status={statusFilter}
 *   clientId={selectedClientId}
 *   clients={clientsList}
 *   onSearchChange={setSearchQuery}
 *   onStatusChange={setStatusFilter}
 *   onClientChange={setSelectedClientId}
 * />
 * 
 * @param {ProjectFiltersProps} props - Component props
 * @returns {JSX.Element} Filter controls for projects
 */
export const ProjectFilters: FC<ProjectFiltersProps> = ({
  search,
  status,
  clientId,
  clients,
  onSearchChange,
  onStatusChange,
  onClientChange,
}) => {
  const { t } = useTranslation('projects');
  
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchChange(event.target.value);
  };

  // Client options for CustomSelect
  const clientOptions = [
    { value: '', label: t('client.all') },
    ...clients.map((client) => ({
      value: client.id,
      label: client.name,
    })),
  ];

  const statusOptions = getStatusOptions(t);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full sm:max-w-sm sm:flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
          aria-hidden="true"
        />
        <input
          id="project-search"
          type="search"
          aria-label={t('search')}
          placeholder={t('search')}
          value={search}
          onChange={handleSearchChange}
          autoComplete="off"
          className={cn(fieldClasses(), 'pl-9')}
        />
      </div>
      <div className="grid w-full grid-cols-1 gap-3 sm:ml-auto sm:flex sm:w-auto sm:items-center">
        <div role="group" aria-label={t('status.label')} className="sm:w-44">
          <CustomSelect
            value={status}
            onChange={(value) => onStatusChange(value as ProjectStatusFilter)}
            options={statusOptions}
            size="md"
          />
        </div>
        <div role="group" aria-label={t('client.label')} className="sm:w-56">
          <CustomSelect
            value={clientId}
            onChange={onClientChange}
            options={clientOptions}
            size="md"
          />
        </div>
      </div>
    </div>
  );
};
