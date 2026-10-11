import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FilePlus2, FolderPlus, LucideIcon, Timer, UserPlus } from 'lucide-react';
import { Button } from '../common/Button';

/**
 * Quick action button configuration.
 *
 * @interface ActionButton
 * @property {string} label - Button text label
 * @property {string} description - What the action does (shown as tooltip)
 * @property {LucideIcon} icon - Lucide icon component
 * @property {string} to - Navigation path (supports query params for modals/wizards)
 * @property {boolean} [primary] - The page's main call to action
 * @property {boolean} [compact] - Icon-only below the xl breakpoint
 */
interface ActionButton {
  label: string;
  description: string;
  icon: LucideIcon;
  to: string;
  primary?: boolean;
  compact?: boolean;
}

/**
 * Quick action buttons for common dashboard tasks, shown in the page header.
 *
 * Features:
 * - Four actions: Add Client, New Project, Create Invoice, Log Time (primary)
 * - Navigation to specific routes with query params for modals/wizards
 * - Descriptions as native tooltips
 * - Secondary actions collapse to icons on narrower screens (labelled for screen readers)
 * - Wraps on small screens
 *
 * @component
 * @example
 * <PageHeader title="Dashboard" actions={<QuickActions />} />
 *
 * @example
 * // Navigation paths
 * // Log Time: /time-entries
 * // Add Client: /clients?modal=new (opens new client modal)
 * // Create Invoice: /invoices?wizard=start (starts invoice wizard)
 * // New Project: /projects?modal=new (opens new project modal)
 *
 * @returns {JSX.Element} Row of quick action buttons
 */
export const QuickActions: FC = () => {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();

  const actions: ActionButton[] = [
    {
      label: t('quickActions.addClient'),
      description: t('quickActions.addClientDesc'),
      icon: UserPlus,
      to: '/clients?modal=new',
      compact: true,
    },
    {
      label: t('quickActions.newProject'),
      description: t('quickActions.newProjectDesc'),
      icon: FolderPlus,
      to: '/projects?modal=new',
      compact: true,
    },
    {
      label: t('quickActions.createInvoice'),
      description: t('quickActions.createInvoiceDesc'),
      icon: FilePlus2,
      to: '/invoices?wizard=start',
    },
    {
      label: t('quickActions.logTime'),
      description: t('quickActions.logTimeDesc'),
      icon: Timer,
      to: '/time-entries',
      primary: true,
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('quickActions.title')}>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Button
            key={action.to}
            type="button"
            variant={action.primary ? 'primary' : 'secondary'}
            leftIcon={<Icon className="h-4 w-4" aria-hidden="true" />}
            title={action.description}
            aria-label={action.compact ? action.label : undefined}
            onClick={() => navigate(action.to)}
          >
            {action.compact ? <span className="hidden xl:inline">{action.label}</span> : action.label}
          </Button>
        );
      })}
    </div>
  );
};
