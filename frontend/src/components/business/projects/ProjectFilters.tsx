import { FC, ChangeEvent } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input, CustomSelect } from '../../forms';
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
 * - Responsive layout (stacked on mobile, row on desktop)
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
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex w-full flex-1 items-center gap-3">
        <div className="w-full lg:max-w-sm">
          <Input
            id="project-search"
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
      <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:grid-cols-3">
        <div>
          <CustomSelect
            label={t('status.label')}
            value={status}
            onChange={(value) => onStatusChange(value as ProjectStatusFilter)}
            options={statusOptions}
            size="sm"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-2">
          <CustomSelect
            label={t('client.label')}
            value={clientId}
            onChange={onClientChange}
            options={clientOptions}
            size="sm"
          />
        </div>
      </div>
    </div>
  );
};
