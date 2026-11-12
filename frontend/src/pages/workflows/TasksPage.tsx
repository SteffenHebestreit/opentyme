/**
 * /tasks — everything the user's flows are waiting for: uploads,
 * confirmations, forms, actions to approve, and notices.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ListChecks } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Tabs } from '../../components/common/Tabs';
import { EmptyState } from '../../components/common/EmptyState';
import { SkeletonItem } from '../../components/common/Skeleton';
import { buttonClasses } from '../../components/common/buttonStyles';
import { TaskCard } from '../../components/workflows/tasks/TaskCard';
import { byRecency, byUrgency } from '../../components/workflows/tasks/taskOrder';
import { useWorkflowTasks } from '../../hooks/api/useWorkflows';

type TaskTab = 'open' | 'closed';

export default function TasksPage() {
  const { t } = useTranslation('workflows');
  const [tab, setTab] = useState<TaskTab>('open');
  const openTasks = useWorkflowTasks('open');
  const closedTasks = useWorkflowTasks('closed', undefined, tab === 'closed');
  const query = tab === 'open' ? openTasks : closedTasks;
  const tasks = tab === 'open' ? byUrgency(openTasks.data ?? []) : byRecency(closedTasks.data ?? []);

  return (
    <div>
      <PageHeader title={t('tasks.title')} subtitle={t('tasks.subtitle')} icon={ListChecks} />
      <Tabs
        tabs={[
          { id: 'open', label: t('tasks.tabs.open'), badge: openTasks.data?.length || undefined },
          { id: 'closed', label: t('tasks.tabs.closed') },
        ]}
        activeTab={tab}
        onChange={(id) => setTab(id === 'closed' ? 'closed' : 'open')}
        className="mb-5"
      />

      {query.isLoading ? (
        <div className="space-y-3" aria-busy="true">
          <SkeletonItem className="h-28 w-full" />
          <SkeletonItem className="h-28 w-full" />
        </div>
      ) : query.isError ? (
        <EmptyState icon={ListChecks} title={t('tasks.loadError')} bordered />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={t(tab === 'open' ? 'tasks.emptyOpen' : 'tasks.emptyClosed')}
          description={tab === 'open' ? t('tasks.emptyOpenHint') : undefined}
          action={
            tab === 'open' ? (
              <Link to="/workflows" className={buttonClasses('secondary')}>
                {t('tasks.toFlows')}
              </Link>
            ) : undefined
          }
          bordered
        />
      ) : (
        <ul className="max-w-3xl space-y-3">
          {tasks.map((task) => (
            <li key={task.id}>
              <TaskCard task={task} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
