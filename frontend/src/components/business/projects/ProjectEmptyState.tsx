import { FC } from 'react';
import { FolderKanban, Plus, SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../common/Button';
import { EmptyState } from '../../common/EmptyState';

/**
 * Props for the ProjectEmptyState component.
 * 
 * @interface ProjectEmptyStateProps
 * @property {() => void} onCreate - Callback when "Add project" button is clicked
 * @property {() => void} [onClearFilters] - Given while filters are active; the list is then empty because of them
 */
interface ProjectEmptyStateProps {
  onCreate: () => void;
  onClearFilters?: () => void;
}

/**
 * Empty state component displayed when no projects exist.
 * 
 * Features:
 * - Dashed border styling for empty state indication
 * - Descriptive message about creating projects
 * - "Add project" button to trigger creation
 * - When filters hide every project: says so and offers to clear them
 * - Centered layout with proper spacing
 * - Dark mode support
 * 
 * Provides clear call-to-action for users to create their first project.
 * 
 * @component
 * @example
 * // In project list page
 * {projects.length === 0 ? (
 *   <ProjectEmptyState onCreate={() => setShowModal(true)} />
 * ) : (
 *   <ProjectTable projects={projects} />
 * )}
 * 
 * @param {ProjectEmptyStateProps} props - Component props
 * @returns {JSX.Element} Empty state with call-to-action
 */
export const ProjectEmptyState: FC<ProjectEmptyStateProps> = ({ onCreate, onClearFilters }) => {
  const { t } = useTranslation('projects');

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
      icon={FolderKanban}
      title={t('empty.title')}
      description={t('empty.message')}
      action={
        <Button type="button" onClick={onCreate} leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>
          {t('addProject')}
        </Button>
      }
    />
  );
};
