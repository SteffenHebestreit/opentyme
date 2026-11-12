/**
 * Status chips for flows, runs, steps and tasks — one colour language
 * everywhere: green done, cyan moving, amber waiting for someone, red needs
 * attention, grey inactive.
 */
import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical } from 'lucide-react';
import { Badge } from '../common/Badge';
import type { BadgeVariant } from '../common/Badge';
import type {
  ApiTokenPermissions,
} from '../../api/types';
import type {
  WorkflowDefinitionStatus,
  WorkflowRunStatus,
  WorkflowStepStatus,
  WorkflowTaskStatus,
} from '../../api/types/workflow.types';

const DEFINITION: Record<WorkflowDefinitionStatus, BadgeVariant> = { draft: 'gray', active: 'green', paused: 'amber', archived: 'gray' };
const RUN: Record<WorkflowRunStatus, BadgeVariant> = {
  running: 'brand',
  waiting: 'amber',
  incident: 'red',
  completed: 'green',
  cancelled: 'gray',
};
const STEP: Record<WorkflowStepStatus, BadgeVariant> = {
  pending: 'gray',
  running: 'brand',
  waiting: 'amber',
  completed: 'green',
  failed: 'red',
  skipped: 'gray',
  cancelled: 'gray',
};
const TASK: Record<WorkflowTaskStatus, BadgeVariant> = { open: 'amber', done: 'green', rejected: 'red', expired: 'gray', cancelled: 'gray' };

export const DefinitionStatusBadge: FC<{ status: WorkflowDefinitionStatus }> = ({ status }) => {
  const { t } = useTranslation('workflows');
  return (
    <Badge variant={DEFINITION[status] ?? 'gray'} size="sm" dot>
      {t(`definitionStatus.${status}`, { defaultValue: status })}
    </Badge>
  );
};

export const RunStatusBadge: FC<{ status: WorkflowRunStatus }> = ({ status }) => {
  const { t } = useTranslation('workflows');
  return (
    <Badge variant={RUN[status] ?? 'gray'} size="sm" dot>
      {t(`runStatus.${status}`, { defaultValue: status })}
    </Badge>
  );
};

export const StepStatusBadge: FC<{ status: WorkflowStepStatus }> = ({ status }) => {
  const { t } = useTranslation('workflows');
  return (
    <Badge variant={STEP[status] ?? 'gray'} size="sm">
      {t(`stepStatus.${status}`, { defaultValue: status })}
    </Badge>
  );
};

export const TaskStatusBadge: FC<{ status: WorkflowTaskStatus }> = ({ status }) => {
  const { t } = useTranslation('workflows');
  return (
    <Badge variant={TASK[status] ?? 'gray'} size="sm">
      {t(`taskStatus.${status}`, { defaultValue: status })}
    </Badge>
  );
};

/** Marks everything that belongs to a test run (mails go to the owner, nothing is marked as sent). */
export const TestRunBadge: FC = () => {
  const { t } = useTranslation('workflows');
  return (
    <Badge variant="violet" size="sm" icon={<FlaskConical className="h-3 w-3" aria-hidden="true" />}>
      {t('testRun.badge')}
    </Badge>
  );
};

/**
 * What a flow's runs may do, spelled out: the features (sending mail) and each
 * data area with its level. Uses the API tokens' wording — it is the same model.
 */
export const PermissionSummary: FC<{ permissions: ApiTokenPermissions }> = ({ permissions }) => {
  const { t } = useTranslation('workflows');
  const resources = Object.entries(permissions.resources ?? {}).filter(([, level]) => level && level !== 'none');
  const capabilities = permissions.capabilities ?? [];
  if (resources.length === 0 && capabilities.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">{t('permissions.none')}</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {capabilities.map((capability) => (
        <li key={capability}>
          <Badge variant="brand" size="sm">
            {t(`settings:admin.apiTokens.capabilities.${capability}.label`, { defaultValue: capability })}
          </Badge>
        </li>
      ))}
      {resources.map(([key, level]) => (
        <li key={key}>
          <Badge variant={level === 'delete' ? 'red' : level === 'write' ? 'amber' : 'gray'} size="sm">
            {t(`settings:admin.apiTokens.resources.${key}.label`, { defaultValue: key })}
            {' · '}
            {t(`settings:admin.apiTokens.levels.${level}`, { defaultValue: String(level) })}
          </Badge>
        </li>
      ))}
    </ul>
  );
};
