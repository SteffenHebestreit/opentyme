/**
 * @fileoverview Client table component for displaying and managing client records.
 * 
 * Displays clients in a comprehensive table format with contact information,
 * status indicators, timestamps, and action buttons. Supports editing and
 * deleting clients with loading states.
 * 
 * Features:
 * - 5-column table: Client, Primary Contact, Status, Created, Actions
 * - Client name with truncated notes preview
 * - Email and phone contact display
 * - Status badges: green for active, gray for inactive
 * - Contract expiry chip (amber: ends soon, red: ended) that opens the documents
 * - Created and updated timestamps
 * - Documents button, icon-only Edit and Delete actions
 * - Loading state during delete operations
 * - Hover effects for better UX
 * - Responsive with horizontal scroll
 * 
 * @module components/business/clients/ClientTable
 */

import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, FileText, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Client } from '../../../api/types';
import { formatYmd } from '../../../utils/date';
import { contractStatus } from '../../../utils/contractStatus';
import { cn } from '../../../lib/cn';
import { Badge } from '../../common/Badge';
import { Button } from '../../common/Button';
import { Table, Column } from '../../common/Table';
import { iconButtonClass } from '../projects/uiClasses';

/**
 * Props for the ClientTable component.
 * 
 * @interface ClientTableProps
 * @property {Client[]} clients - Array of client records to display
 * @property {(client: Client) => void} onEdit - Handler for edit button click
 * @property {(client: Client) => void} onDelete - Handler for delete button click
 * @property {(client: Client) => void} onOpenDocuments - Handler for opening the client's stored documents
 * @property {string | null} [isDeletingId] - ID of client currently being deleted (for loading state)
 */
interface ClientTableProps {
  clients: Client[];
  onEdit: (client: Client) => void;
  onDelete: (client: Client) => void;
  onOpenDocuments: (client: Client) => void;
  isDeletingId?: string | null;
}

/**
 * Formats an ISO date string for display in the user's language.
 * 
 * Converts ISO 8601 date strings to a short readable date ("Jan 15, 2024",
 * "15. Jan. 2024"). Falls back to original string if parsing fails.
 * 
 * @function
 * @param {string} isoString - ISO 8601 date string to format
 * @param {string} locale - UI language
 * @returns {string} Formatted date string or original string if invalid
 * @example
 * formatDate('2024-01-15T10:30:00Z', 'en') // Returns: "Jan 15, 2024"
 * formatDate('invalid', 'en') // Returns: "invalid"
 */
const formatDate = (isoString: string, locale: string) => {
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(isoString));
  } catch (error) {
    return isoString;
  }
};

/**
 * Table component for displaying client records with actions.
 * 
 * Displays clients in a structured table format with comprehensive information
 * including contact details, status, timestamps, and management actions.
 * 
 * Table Columns:
 * 1. **Client**: Client name (bold) + truncated notes (1 line max)
 * 2. **Primary Contact**: Email (normal size) + phone (smaller, below)
 * 3. **Status**: Badge indicator (Active in green, Inactive in gray)
 * 4. **Created**: Created date + updated date (smaller, below)
 * 5. **Actions**: Documents button, Edit and Delete icon buttons
 * 
 * Status Display:
 * - **Active**: Green badge with "Active" text
 * - **Inactive**: Gray badge with "Inactive" text
 * - Rounded pill shape for visual distinction
 * 
 * Contact Information:
 * - Email displayed if available (primary contact)
 * - Phone displayed below email if available (secondary)
 * - Column empty if both missing
 * - Email and phone vertically stacked with gap
 * 
 * Timestamp Display:
 * - Created date shown in normal size
 * - Updated date shown below in smaller, lighter text
 * - Both formatted as "MMM d, yyyy"
 * - Vertically stacked in flex column
 * 
 * Action Buttons:
 * - **Edit**: Opens edit modal with client data
 * - **Delete**: Triggers delete operation with confirmation
 * - Delete button disabled and shows a spinner during operation
 * - Buttons aligned to the right with gap
 * 
 * Loading States:
 * - Delete button shows a spinner when isDeletingId matches client ID
 * - Button disabled during deletion to prevent double-clicks
 * 
 * Styling:
 * - White card with border and shadow
 * - Row hover effect for better interaction feedback
 * - Consistent padding and spacing
 * - Dark mode support throughout
 * - Responsive with horizontal scroll on small screens
 * 
 * @component
 * @example
 * // Basic usage
 * <ClientTable
 *   clients={clients}
 *   onEdit={(client) => {
 *     setSelectedClient(client);
 *     setIsEditModalOpen(true);
 *   }}
 *   onDelete={(client) => {
 *     if (confirm(`Delete ${client.name}?`)) {
 *       deleteClientMutation.mutate(client.id);
 *     }
 *   }}
 * />
 * 
 * @example
 * // With loading state tracking
 * <ClientTable
 *   clients={clients}
 *   onEdit={handleEditClient}
 *   onDelete={handleDeleteClient}
 *   isDeletingId={deleteClientMutation.variables}
 * />
 * 
 * @param {ClientTableProps} props - Component props
 * @returns {JSX.Element} Client table component
 */
export const ClientTable: FC<ClientTableProps> = ({ clients, onEdit, onDelete, onOpenDocuments, isDeletingId }) => {
  const { t, i18n } = useTranslation('clients');

  const columns: Column<Client>[] = useMemo(() => [
    {
      key: 'client',
      accessorKey: 'name',
      header: t('table.client'),
      render: (client) => {
        // Contracts ending soon (amber) or just ended (red) — one click from here to extend them.
        const expiry = client.expiring_documents && client.next_document_expiry
          ? contractStatus(null, client.next_document_expiry)
          : null;
        const expired = expiry?.kind === 'expired';
        return (
          <div className="min-w-[12rem]">
            <div className="font-medium text-gray-900 dark:text-white">{client.name}</div>
            {client.notes ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">{client.notes}</p>
            ) : null}
            {expiry && client.next_document_expiry ? (
              <button
                type="button"
                onClick={() => onOpenDocuments(client)}
                title={t('documents.expiryHint', { date: formatYmd(client.next_document_expiry, i18n.language) })}
                className="mt-1.5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <Badge
                  size="sm"
                  variant={expired ? 'red' : 'amber'}
                  icon={<CalendarClock className="h-3 w-3" aria-hidden="true" />}
                  className="transition-opacity hover:opacity-80"
                >
                  {t(expired ? 'documents.chip.expired' : 'documents.chip.expiring', {
                    date: formatYmd(client.next_document_expiry, i18n.language),
                  })}
                </Badge>
              </button>
            ) : null}
          </div>
        );
      },
      sortable: true,
    },
    {
      key: 'contact',
      accessorKey: 'email',
      header: t('table.contact'),
      render: (client) => (
        <div className="flex flex-col gap-0.5">
          {client.email && <span className="text-sm text-gray-700 dark:text-gray-300">{client.email}</span>}
          {client.phone && <span className="text-xs text-gray-500 dark:text-gray-400">{client.phone}</span>}
          {!client.email && !client.phone ? <span className="text-gray-400 dark:text-gray-500">—</span> : null}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'status',
      accessorKey: 'status',
      header: t('table.status'),
      render: (client) => (
        <Badge variant={client.status === 'active' ? 'green' : 'gray'} dot>
          {client.status === 'active' ? t('status.active') : t('status.inactive')}
        </Badge>
      ),
      sortable: true,
    },
    {
      key: 'created',
      accessorKey: 'created_at',
      header: t('table.created'),
      render: (client) => (
        <div className="flex flex-col tabular-nums">
          <span className="whitespace-nowrap">{formatDate(client.created_at, i18n.language)}</span>
          <span className="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
            {t('table.updated')} {formatDate(client.updated_at, i18n.language)}
          </span>
        </div>
      ),
      sortable: true,
    },
    {
      key: 'actions',
      // Visually hidden; `relative` keeps the sr-only label inside the table's scroll area
      header: <span className="sr-only">{t('table.actions')}</span>,
      headerClassName: 'relative',
      align: 'right',
      render: (client) => {
        const deleting = isDeletingId === client.id;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mr-1"
              onClick={() => onOpenDocuments(client)}
              leftIcon={<FileText className="h-3.5 w-3.5" aria-hidden="true" />}
              title={
                client.expiring_documents && client.next_document_expiry
                  ? t('documents.expiryHint', { date: formatYmd(client.next_document_expiry, i18n.language) })
                  : undefined
              }
            >
              {t('documents.action')}
              {client.documents_count ? (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-xs font-semibold tabular-nums',
                    client.expiring_documents
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'
                  )}
                >
                  {client.documents_count}
                </span>
              ) : null}
            </Button>
            <button
              type="button"
              className={iconButtonClass()}
              onClick={() => onEdit(client)}
              aria-label={t('actions.edit', { name: client.name })}
              title={t('edit')}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={iconButtonClass('danger')}
              onClick={() => onDelete(client)}
              disabled={deleting}
              aria-label={deleting ? t('deleting') : t('actions.delete', { name: client.name })}
              title={deleting ? t('deleting') : t('delete')}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        );
      },
    },
  ], [t, i18n.language, onEdit, onDelete, onOpenDocuments, isDeletingId]);
  
  return <Table data={clients} columns={columns} pageSize={10} />;
};
