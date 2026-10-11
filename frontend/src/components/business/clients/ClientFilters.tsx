import { FC, ChangeEvent } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from '../../forms';
import { fieldClasses } from '../../forms/fieldStyles';
import { cn } from '../../../lib/cn';

/**
 * Union type for client status filter, including 'all' option.
 *
 * @type {ClientStatusFilter}
 */
export type ClientStatusFilter = 'all' | 'active' | 'inactive';

/**
 * Filter controls for the clients list.
 *
 * **Features:**
 * - Text search by client name
 * - Status filter dropdown (all, active, inactive)
 * - Search icon in search input
 * - Compact one-row toolbar that wraps on small screens
 * - Dark mode support
 *
 * **Filter Options:**
 * - **Search**: Searches client name
 * - **Status**: All statuses, Active, Inactive
 *
 * @component
 * @example
 * <ClientFilters
 *   search={searchQuery}
 *   status={statusFilter}
 *   onSearchChange={setSearchQuery}
 *   onStatusChange={setStatusFilter}
 * />
 *
 * @example
 * // With state management
 * const [filters, setFilters] = useState({
 *   search: '',
 *   status: 'all' as ClientStatusFilter,
 * });
 *
 * <ClientFilters
 *   search={filters.search}
 *   status={filters.status}
 *   onSearchChange={(search) => setFilters({ ...filters, search })}
 *   onStatusChange={(status) => setFilters({ ...filters, status })}
 * />
 */

/**
 * Props for the ClientFilters component.
 *
 * @interface ClientFiltersProps
 * @property {string} search - Current search query
 * @property {ClientStatusFilter} status - Current status filter
 * @property {(value: string) => void} onSearchChange - Callback when search changes
 * @property {(value: ClientStatusFilter) => void} onStatusChange - Callback when status filter changes
 */
interface ClientFiltersProps {
  search: string;
  status: ClientStatusFilter;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: ClientStatusFilter) => void;
}

/**
 * Status filter options for the dropdown.
 *
 * @constant
 */
const getStatusOptions = (t: (key: string) => string): Array<{ label: string; value: ClientStatusFilter }> => [
  { label: t('status.all'), value: 'all' },
  { label: t('status.active'), value: 'active' },
  { label: t('status.inactive'), value: 'inactive' },
];

export const ClientFilters: FC<ClientFiltersProps> = ({
  search,
  status,
  onSearchChange,
  onStatusChange,
}) => {
  const { t } = useTranslation('clients');
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchChange(event.target.value);
  };

  const statusOptions = getStatusOptions(t);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full sm:max-w-sm sm:flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
          aria-hidden="true"
        />
        <input
          id="client-search"
          type="search"
          aria-label={t('search')}
          placeholder={t('search')}
          value={search}
          onChange={handleSearchChange}
          autoComplete="off"
          className={cn(fieldClasses(), 'pl-9')}
        />
      </div>
      <div role="group" aria-label={t('status.label')} className="w-full sm:ml-auto sm:w-48">
        <CustomSelect
          value={status}
          onChange={(value) => onStatusChange(value as ClientStatusFilter)}
          options={statusOptions}
          size="md"
        />
      </div>
    </div>
  );
};
