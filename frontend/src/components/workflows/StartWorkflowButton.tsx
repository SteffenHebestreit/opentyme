/**
 * "Start flow" for one client, project or invoice: offers the user's active,
 * published flows for that kind of subject and opens the start dialog with the
 * subject already set. Renders nothing while there is no such flow.
 */
import { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Workflow } from 'lucide-react';
import { Button } from '../common/Button';
import { Modal } from '../ui/Modal';
import { iconButtonClass } from '../business/projects/uiClasses';
import { useWorkflowDefinitions } from '../../hooks/api/useWorkflows';
import type { WorkflowDefinitionSummary, WorkflowSubjectType } from '../../api/types/workflow.types';
import { StartRunDialog } from './StartRunDialog';

interface StartWorkflowButtonProps {
  subjectType: Exclude<WorkflowSubjectType, 'none'>;
  subjectId: string;
  /** Names the subject in the button's label, e.g. the client's name. */
  subjectName?: string;
  /** Icon only — for rows of a table. */
  compact?: boolean;
  className?: string;
}

export const StartWorkflowButton: FC<StartWorkflowButtonProps> = ({ subjectType, subjectId, subjectName, compact = false, className }) => {
  const { t } = useTranslation('workflows');
  const { data: definitions } = useWorkflowDefinitions();
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<WorkflowDefinitionSummary | null>(null);

  const startable = (definitions ?? []).filter(
    (definition) => definition.subject_type === subjectType && definition.status === 'active' && definition.published_version !== null
  );
  if (startable.length === 0) return null;

  const label = subjectName ? t('start.buttonFor', { name: subjectName }) : t('start.button');
  // One fitting flow starts right away; several are offered to choose from
  const open = () => (startable.length === 1 ? setChosen(startable[0]) : setChoosing(true));

  return (
    <>
      {compact ? (
        <button type="button" className={className ?? iconButtonClass()} onClick={open} aria-label={label} title={t('start.button')}>
          <Play className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : (
        <Button type="button" variant="secondary" size="sm" className={className} leftIcon={<Play className="h-4 w-4" aria-hidden="true" />} onClick={open}>
          {t('start.button')}
        </Button>
      )}

      <Modal
        open={choosing}
        onClose={() => setChoosing(false)}
        size="sm"
        title={t('start.chooseFlow')}
        icon={<Workflow className="h-4 w-4" aria-hidden="true" />}
      >
        <ul className="space-y-2">
          {startable.map((definition) => (
            <li key={definition.id}>
              <button
                type="button"
                onClick={() => {
                  setChoosing(false);
                  setChosen(definition);
                }}
                className="w-full rounded-lg border border-gray-200 p-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-gray-700 dark:hover:border-brand-500 dark:hover:bg-brand-500/10"
              >
                <span className="block text-sm font-medium text-gray-900 dark:text-white">{definition.name}</span>
                {definition.description && <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{definition.description}</span>}
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      {chosen && <StartRunDialog definition={chosen} open onClose={() => setChosen(null)} subjectId={subjectId} />}
    </>
  );
};
