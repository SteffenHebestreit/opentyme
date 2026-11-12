/**
 * Runs as a table: which flow, for whom, which period, where it stands.
 */
import { FC, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Table } from '../../common/Table';
import type { Column } from '../../common/Table';
import type { WorkflowRunSummary } from '../../../api/types/workflow.types';
import { formatDistanceToNow, formatYmd } from '../../../utils/date';
import { RunStatusBadge, TestRunBadge } from '../WorkflowBadges';

interface RunsTableProps {
  runs: WorkflowRunSummary[];
  isLoading?: boolean;
  /** Leave the flow column out — when the table already belongs to one flow. */
  hideFlow?: boolean;
  emptyMessage: string;
}

// The row is clickable for the mouse; the link is what the keyboard and screen readers get
const linkClass =
  'rounded font-medium text-gray-900 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-white dark:hover:text-brand-300';

export const RunsTable: FC<RunsTableProps> = ({ runs, isLoading, hideFlow = false, emptyMessage }) => {
  const { t, i18n } = useTranslation('workflows');
  const navigate = useNavigate();
  const locale = i18n.language;

  const columns = useMemo<Column<WorkflowRunSummary>[]>(() => {
    const all: Column<WorkflowRunSummary>[] = [
      {
        key: 'definition_name',
        header: t('runs.columns.flow'),
        sortable: true,
        sortValue: (run) => run.definition_name,
        render: (run) => (
          <div className="min-w-0">
            <Link to={`/workflows/runs/${run.id}`} className={linkClass}>
              {run.definition_name}
            </Link>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t('editor.version', { version: run.version })}</div>
          </div>
        ),
      },
      {
        key: 'subject_label',
        header: t('runs.columns.subject'),
        sortable: true,
        sortValue: (run) => run.subject_label ?? '',
        render: (run) =>
          hideFlow ? (
            <Link to={`/workflows/runs/${run.id}`} className={linkClass}>
              {run.subject_label ?? t('runs.open')}
            </Link>
          ) : (
            <span className="text-gray-700 dark:text-gray-300">{run.subject_label ?? '—'}</span>
          ),
      },
      {
        key: 'period',
        header: t('runs.columns.period'),
        sortable: true,
        sortValue: (run) => run.period_start ?? '',
        render: (run) =>
          run.period_start && run.period_end ? (
            <span className="whitespace-nowrap tabular-nums text-gray-700 dark:text-gray-300">
              {formatYmd(run.period_start, locale)} – {formatYmd(run.period_end, locale)}
            </span>
          ) : (
            '—'
          ),
      },
      {
        key: 'status',
        header: t('runs.columns.status'),
        sortable: true,
        sortValue: (run) => run.status,
        render: (run) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <RunStatusBadge status={run.status} />
            {run.test_mode && <TestRunBadge />}
          </div>
        ),
      },
      {
        key: 'current',
        header: t('runs.columns.current'),
        render: (run) => (
          <span className="block max-w-[16rem] truncate text-gray-600 dark:text-gray-400" title={run.current_node_label ?? run.result ?? undefined}>
            {run.current_node_label ?? run.result ?? '—'}
          </span>
        ),
      },
      {
        key: 'started_at',
        header: t('runs.columns.started'),
        sortable: true,
        sortValue: (run) => run.started_at,
        render: (run) => (
          <span className="whitespace-nowrap text-gray-600 dark:text-gray-400">
            {formatDistanceToNow(run.started_at)}
            {run.started_by === 'schedule' && ` · ${t('runs.bySchedule')}`}
            {run.started_by === 'event' && ` · ${t('runs.byEvent')}`}
          </span>
        ),
      },
    ];
    return hideFlow ? all.filter((column) => column.key !== 'definition_name') : all;
  }, [hideFlow, t, locale]);

  return (
    <Table
      data={runs}
      columns={columns}
      isLoading={isLoading}
      emptyMessage={emptyMessage}
      onRowClick={(run) => navigate(`/workflows/runs/${run.id}`)}
      defaultSort={{ key: 'started_at', direction: 'desc' }}
    />
  );
};
