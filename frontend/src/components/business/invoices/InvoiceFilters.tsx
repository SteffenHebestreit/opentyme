import { ChangeEvent, FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { CustomSelect } from '../../forms';
import { fieldClasses } from '../../forms/fieldStyles';
import { Client, InvoiceStatus } from '../../../api/types';
import { cn } from '../../../lib/cn';

/**
 * Union type for invoice status filter, including 'all' option.
 *
 * @type {InvoiceStatusFilter}
 */
export type InvoiceStatusFilter = 'all' | InvoiceStatus;

/**
 * Filter controls for the invoices list.
 *
 * **Features:**
 * - Text search by invoice number, client, or project
 * - Status filter dropdown (all, draft, sent, paid, overdue, cancelled)
 * - Client filter dropdown
 * - Search icon in search input
 * - One-line toolbar (stacks on narrow screens)
 * - Dark mode support
 *
 * **Filter Options:**
 * - **Search**: Searches invoice number, client name, and project name
 * - **Status**: All statuses, Draft, Sent, Paid, Overdue, Cancelled
 * - **Client**: All clients or specific client
 *
 * **Note:** Date range filtering is handled by the parent component (FinancesPage).
 *
 * @component
 * @example
 * <InvoiceFilters
 *   search={searchQuery}
 *   status={statusFilter}
 *   clientId={selectedClientId}
 *   onSearchChange={setSearchQuery}
 *   onStatusChange={setStatusFilter}
 *   onClientChange={setSelectedClientId}
 *   clients={clients}
 * />
 *
 * @example
 * // With state management
 * const [filters, setFilters] = useState({
 *   search: '',
 *   status: 'all' as InvoiceStatusFilter,
 *   clientId: '',
 * });
 *
 * <InvoiceFilters
 *   {...filters}
 *   onSearchChange={(search) => setFilters({ ...filters, search })}
 *   onStatusChange={(status) => setFilters({ ...filters, status })}
 *   onClientChange={(clientId) => setFilters({ ...filters, clientId })}
 *   clients={clients}
 * />
 */

/**
 * Props for the InvoiceFilters component.
 *
 * @interface InvoiceFiltersProps
 * @property {string} search - Current search query
 * @property {InvoiceStatusFilter} status - Current status filter
 * @property {string} clientId - Current selected client ID (empty for all)
 * @property {(value: string) => void} onSearchChange - Callback when search changes
 * @property {(status: InvoiceStatusFilter) => void} onStatusChange - Callback when status filter changes
 * @property {(clientId: string) => void} onClientChange - Callback when client filter changes
 * @property {Client[]} clients - Available clients for filtering
 */
interface InvoiceFiltersProps {
  search: string;
  status: InvoiceStatusFilter;
  clientId: string;
  onSearchChange: (value: string) => void;
  onStatusChange: (status: InvoiceStatusFilter) => void;
  onClientChange: (clientId: string) => void;
  clients: Client[];
}

export const InvoiceFilters: FC<InvoiceFiltersProps> = ({
  search,
  status,
  clientId,
  onSearchChange,
  onStatusChange,
  onClientChange,
  clients,
}) => {
  const { t } = useTranslation('invoices');
  
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchChange(event.target.value);
  };

  // Status filter options
  const statusOptions: Array<{ label: string; value: InvoiceStatusFilter }> = [
    { label: t('filters.status.all'), value: 'all' },
    { label: t('status.draft'), value: 'draft' },
    { label: t('status.sent'), value: 'sent' },
    { label: t('status.partiallyPaid'), value: 'partially_paid' },
    { label: t('status.paid'), value: 'paid' },
    { label: t('status.overdue'), value: 'overdue' },
    { label: t('status.cancelled'), value: 'cancelled' },
  ];

  // Client options for CustomSelect
  const clientOptions = [
    { value: '', label: t('filters.client.all') },
    ...clients.map((client) => ({
      value: client.id,
      label: client.name,
    })),
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full sm:max-w-sm sm:flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
          aria-hidden="true"
        />
        <input
          id="invoice-search"
          type="search"
          placeholder={t('filters.search')}
          aria-label={t('filters.search')}
          value={search}
          onChange={handleSearchChange}
          autoComplete="off"
          className={cn(fieldClasses(), 'pl-9')}
        />
      </div>
      <div className="grid w-full grid-cols-2 gap-3 sm:ml-auto sm:flex sm:w-auto">
        <CustomSelect
          value={status}
          onChange={(value) => onStatusChange(value as InvoiceStatusFilter)}
          options={statusOptions}
          size="md"
          className="sm:w-44"
          aria-label={t('filters.status.label')}
        />
        <CustomSelect
          value={clientId}
          onChange={onClientChange}
          options={clientOptions}
          size="md"
          className="sm:w-48"
          aria-label={t('filters.client.label')}
        />
      </div>
    </div>
  );
};
