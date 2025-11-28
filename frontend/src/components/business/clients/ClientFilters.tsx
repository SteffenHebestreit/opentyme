import { FC, ChangeEvent } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input, CustomSelect } from '../../forms';

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
 * - Responsive layout
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
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex w-full flex-1 items-center gap-3">
        <div className="w-full lg:max-w-sm">
          <Input
            id="client-search"
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
      <div className="sm:w-48">
        <CustomSelect
          label={t('status.label')}
          value={status}
          onChange={(value) => onStatusChange(value as ClientStatusFilter)}
          options={statusOptions}
          size="md"
        />
      </div>
    </div>
  );
};
