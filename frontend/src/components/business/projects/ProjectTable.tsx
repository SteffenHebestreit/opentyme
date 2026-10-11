import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Coins, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Project, ProjectStatus } from '../../../api/types';
import { Badge, BadgeVariant } from '../../common/Badge';
import { Button } from '../../common/Button';
import { formatCurrency as formatMoney } from '../../../utils/currency';
import { formatYmd } from '../../../utils/date';
import { Table, Column } from '../../common/Table';
import { iconButtonClass } from './uiClasses';

/**
 * Props for the ProjectTable component.
 * 
 * @interface ProjectTableProps
 * @property {Project[]} projects - Array of projects to display
 * @property {(project: Project) => void} onEdit - Callback when edit button is clicked
 * @property {(project: Project) => void} onManageRates - Callback when the rate timeline button is clicked
 * @property {(project: Project) => void} onDelete - Callback when delete button is clicked
 * @property {string | null} [isDeletingId] - ID of project currently being deleted (shows loading state)
 */
interface ProjectTableProps {
  projects: Project[];
  onEdit: (project: Project) => void;
  onManageRates: (project: Project) => void;
  onDelete: (project: Project) => void;
  isDeletingId?: string | null;
}

/**
 * Status display labels.
 * @constant
 */
const getStatusLabel = (t: (key: string) => string, status: ProjectStatus): string => {
  const labels: Record<ProjectStatus, string> = {
    not_started: t('status.notStarted'),
    active: t('status.active'),
    on_hold: t('status.onHold'),
    completed: t('status.completed'),
  };
  return labels[status];
};

const statusVariants: Record<ProjectStatus, BadgeVariant> = {
  not_started: 'gray',
  active: 'green',
  on_hold: 'amber',
  completed: 'blue',
};

const formatDate = (iso: string | null, locale: string) => formatYmd(iso, locale);

const formatCurrency = (value: number | null, currency: string = 'USD') => {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0,
  }).format(value);
};

/**
 * Project table component displaying projects with sortable columns.
 * 
 * Features:
 * - 7 columns: Project (name + description), Client, Status, Timeline (start/end dates), Budget, Tracked hours, Actions
 * - Color-coded status badges (not_started: gray, active: green, on_hold: amber, completed: blue)
 * - Currency formatting for budget
 * - Date formatting (MMM d, yyyy)
 * - Hover effects on rows
 * - Rates (date-effective hourly rate timeline) button, icon-only Edit and Delete actions
 * - Loading state for delete button (spinner when isDeletingId matches)
 * - Dark mode support
 * - Responsive horizontal scroll
 * 
 * Budget displays either hourly rate or fixed fee amount based on rate_type.
 * Tracked hours shows total_hours_tracked field.
 * 
 * @component
 * @example
 * <ProjectTable
 *   projects={filteredProjects}
 *   onEdit={handleEdit}
 *   onManageRates={openRatesModal}
 *   onDelete={handleDelete}
 *   isDeletingId={deletingProjectId}
 * />
 * 
 * @param {ProjectTableProps} props - Component props
 * @returns {JSX.Element} Table of projects with actions
 */
export const ProjectTable: FC<ProjectTableProps> = ({ projects, onEdit, onManageRates, onDelete, isDeletingId }) => {
  const { t, i18n } = useTranslation('projects');
  const lng = i18n.language;

  const columns: Column<Project>[] = useMemo(() => [
    {
      key: 'project',
      accessorKey: 'name',
      header: t('table.project'),
      render: (project) => (
        <div className="min-w-[12rem] max-w-md">
          <div className="font-medium text-gray-900 dark:text-white">{project.name}</div>
          {project.description ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{project.description}</p>
          ) : null}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'client',
      accessorKey: 'client_name',
      header: t('table.client'),
      render: (project) => (
        <div className="min-w-[8rem] max-w-[14rem] text-gray-700 dark:text-gray-300">
          {project.client_name ?? <span className="text-gray-400 dark:text-gray-500">—</span>}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'status',
      accessorKey: 'status',
      header: t('table.status'),
      render: (project) => (
        <Badge variant={statusVariants[project.status]} dot>
          {getStatusLabel(t, project.status)}
        </Badge>
      ),
      sortable: true,
    },
    {
      key: 'timeline',
      accessorKey: 'start_date',
      header: t('table.timeline'),
      render: (project) => (
        <dl className="grid grid-cols-[auto_auto] justify-start gap-x-2 text-xs tabular-nums">
          <dt className="text-gray-500 dark:text-gray-400">{t('table.start')}</dt>
          <dd className="text-gray-700 dark:text-gray-300">{formatDate(project.start_date, lng)}</dd>
          <dt className="text-gray-500 dark:text-gray-400">{t('table.due')}</dt>
          <dd className="text-gray-700 dark:text-gray-300">{formatDate(project.end_date, lng)}</dd>
        </dl>
      ),
      sortable: true,
    },
    {
      key: 'budget',
      accessorKey: 'budget',
      header: t('table.budget'),
      align: 'right',
      render: (project) => (
        <div className="flex flex-col items-end tabular-nums">
          <span className="font-medium text-gray-900 dark:text-white">
            {formatCurrency(project.budget, project.currency || 'USD')}
          </span>
          <span className="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
            {t('table.rate')}:{' '}
            {project.hourly_rate != null
              ? `${formatMoney(project.hourly_rate, project.currency || 'EUR')}${t('rates.perHour')}`
              : '—'}
          </span>
          {/* A scheduled change nobody can see is one nobody double-checks. */}
          {project.next_rate != null && project.next_rate_from ? (
            <Badge
              size="sm"
              variant="blue"
              className="mt-1"
              icon={<CalendarClock className="h-3 w-3" aria-hidden="true" />}
            >
              {t('table.nextRate', {
                date: formatYmd(project.next_rate_from, lng),
                rate: formatMoney(project.next_rate, project.currency || 'EUR'),
              })}
            </Badge>
          ) : null}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'trackedHours',
      accessorKey: 'total_tracked_hours',
      header: t('table.trackedHours'),
      headerClassName: 'whitespace-nowrap',
      align: 'right',
      render: (project) => (
        <div className="whitespace-nowrap tabular-nums text-gray-700 dark:text-gray-300">
          {project.total_tracked_hours != null
            ? `${new Intl.NumberFormat(lng, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(project.total_tracked_hours)} h`
            : '—'}
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
      render: (project) => {
        const deleting = isDeletingId === project.id;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mr-1"
              onClick={() => onManageRates(project)}
              leftIcon={<Coins className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              {t('rates.manage')}
            </Button>
            <button
              type="button"
              className={iconButtonClass()}
              onClick={() => onEdit(project)}
              aria-label={t('actions.edit', { name: project.name })}
              title={t('edit')}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={iconButtonClass('danger')}
              onClick={() => onDelete(project)}
              disabled={deleting}
              aria-label={deleting ? t('deleting') : t('actions.delete', { name: project.name })}
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
  ], [t, lng, onEdit, onManageRates, onDelete, isDeletingId]);
  
  return <Table data={projects} columns={columns} pageSize={10} />;
};
