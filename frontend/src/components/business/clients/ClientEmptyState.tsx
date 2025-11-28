import { FC } from 'react';
import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../common/Button';

/**
 * Empty state component for the clients list.
 *
 * **Features:**
 * - Centered layout with dashed border
 * - Users icon in indigo circle
 * - Descriptive message about adding clients
 * - Call-to-action button
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
 */
interface ClientEmptyStateProps {
  onCreate: () => void;
}

export const ClientEmptyState: FC<ClientEmptyStateProps> = ({ onCreate }) => {
  const { t } = useTranslation('clients');
  
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10">
        <Users className="h-8 w-8" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('empty.title')}</h3>
        <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">
          {t('empty.message')}
        </p>
      </div>
      <Button type="button" onClick={onCreate}>
        {t('addClient')}
      </Button>
    </div>
  );
};
