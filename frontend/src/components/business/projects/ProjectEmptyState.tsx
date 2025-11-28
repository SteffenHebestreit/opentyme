import { FC } from 'react';
import { ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../common/Button';

/**
 * Props for the ProjectEmptyState component.
 * 
 * @interface ProjectEmptyStateProps
 * @property {() => void} onCreate - Callback when "Add project" button is clicked
 */
interface ProjectEmptyStateProps {
  onCreate: () => void;
}

/**
 * Empty state component displayed when no projects exist.
 * 
 * Features:
 * - Dashed border styling for empty state indication
 * - ClipboardList icon in indigo circle
 * - Descriptive message about creating projects
 * - "Add project" button to trigger creation
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
export const ProjectEmptyState: FC<ProjectEmptyStateProps> = ({ onCreate }) => {
  const { t } = useTranslation('projects');
  
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10">
        <ClipboardList className="h-8 w-8" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('empty.title')}</h3>
        <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">
          {t('empty.message')}
        </p>
      </div>
      <Button type="button" onClick={onCreate}>
        {t('addProject')}
      </Button>
    </div>
  );
};
