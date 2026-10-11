import { FC } from 'react';
import { Plus, SearchX, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../common/Button';
import { EmptyState } from '../../common/EmptyState';

/**
 * Empty state component for the clients list.
 *
 * **Features:**
 * - Centered layout with dashed border
 * - Descriptive message about adding clients
 * - Call-to-action button
 * - When filters hide every client: says so and offers to clear them
 * - Dark mode support
 *
 * **Usage:**
 * Display when no clients exist to guide users to create their first client.
 *
 * @component
 * @example
 * <ClientEmptyState
 *   onCreate={() => setShowCreateModal(true)}
 * />
 *
 * @example
 * // Conditional rendering
 * {clients.length === 0 ? (
 *   <ClientEmptyState onCreate={handleAddClient} />
 * ) : (
 *   <ClientTable clients={clients} />
 * )}
 */

/**
 * Props for the ClientEmptyState component.
 *
 * @interface ClientEmptyStateProps
 * @property {() => void} onCreate - Callback when create button is clicked
 * @property {() => void} [onClearFilters] - Given while filters are active; the list is then empty because of them
 */
interface ClientEmptyStateProps {
  onCreate: () => void;
  onClearFilters?: () => void;
}

export const ClientEmptyState: FC<ClientEmptyStateProps> = ({ onCreate, onClearFilters }) => {
  const { t } = useTranslation('clients');

  if (onClearFilters) {
    return (
      <EmptyState
        bordered
        icon={SearchX}
        title={t('empty.filteredTitle')}
        description={t('empty.filteredMessage')}
        action={
          <Button type="button" variant="secondary" onClick={onClearFilters}>
            {t('empty.clearFilters')}
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      bordered
      icon={Users}
      title={t('empty.title')}
      description={t('empty.message')}
      action={
        <Button type="button" onClick={onCreate} leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>
          {t('addClient')}
        </Button>
      }
    />
  );
};
