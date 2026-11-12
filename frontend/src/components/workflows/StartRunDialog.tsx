/**
 * Starts a run of a published flow: for which subject, which period, and
 * whether as a test. A flow runs once per subject and period — a duplicate
 * start points to the run that already exists.
 */
import { FC, FormEvent, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import { Select } from '../forms';
import { fieldClasses, fieldLabelClass } from '../forms/fieldStyles';
import { workflowApiError } from '../../api/services/workflow.service';
import { useStartWorkflowRun, useWorkflowCatalog } from '../../hooks/api/useWorkflows';
import type { StartRunRequest, WorkflowDefinitionSummary } from '../../api/types/workflow.types';
import { currentMonth } from './graph/period';
import { ClientOptions, InvoiceOptions, ProjectOptions, SubjectOptions } from './EntityOptions';
import { useWorkflowLabels } from './useWorkflowLabels';

export type StartableWorkflow = Pick<WorkflowDefinitionSummary, 'id' | 'name' | 'subject_type' | 'published_version' | 'has_unpublished_changes'>;

interface StartRunDialogProps {
  definition: StartableWorkflow;
  open: boolean;
  onClose: () => void;
  /** Start for this subject — the picker is hidden (used on a client's or project's own page). */
  subjectId?: string;
}

export const StartRunDialog: FC<StartRunDialogProps> = ({ definition, open, onClose, subjectId: fixedSubjectId }) => {
  const { t } = useTranslation('workflows');
  const navigate = useNavigate();
  const formId = useId();
  const startRun = useStartWorkflowRun();
  const { data: catalog } = useWorkflowCatalog();
  const { subjectTypeLabel } = useWorkflowLabels(catalog);
  const [month] = useState(() => currentMonth());
  const [subjectId, setSubjectId] = useState(fixedSubjectId ?? '');
  const [periodStart, setPeriodStart] = useState(month.start);
  const [periodEnd, setPeriodEnd] = useState(month.end);
  const [test, setTest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingRunId, setExistingRunId] = useState<string | null>(null);

  const subjectType = definition.subject_type;
  const needsSubject = subjectType !== 'none';
  const subjectName = subjectTypeLabel(subjectType);
  // A period belongs to what recurs (a month of work for a client or project) — the kinds of subject a flow can
  // also be scheduled for. One invoice, or one record of an addon, has none.
  const subjectSpec = catalog?.subjects?.find((subject) => subject.key === subjectType);
  const hasPeriod = !needsSubject || (subjectSpec ? !!subjectSpec.schedulable : subjectType === 'client' || subjectType === 'project');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setExistingRunId(null);
    if (needsSubject && !subjectId) {
      setError(t(`start.dialog.subjectRequired.${subjectType}`, { defaultValue: t('start.dialog.subjectRequiredGeneric', { subject: subjectName }) }));
      return;
    }
    if (hasPeriod && periodStart && periodEnd && periodEnd < periodStart) {
      setError(t('start.dialog.periodInvalid'));
      return;
    }
    const request: StartRunRequest = { test };
    if (needsSubject) request.subject_id = subjectId;
    if (hasPeriod && periodStart && periodEnd) {
      request.period_start = periodStart;
      request.period_end = periodEnd;
    }
    try {
      const run = await startRun.mutateAsync({ definitionId: definition.id, request });
      onClose();
      navigate(`/workflows/runs/${run.id}`);
    } catch (err: unknown) {
      const body = workflowApiError(err);
      if (body.code === 'RUN_EXISTS' && body.runId) {
        setExistingRunId(body.runId);
        return;
      }
      setError(body.message ?? t('start.dialog.error'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('start.dialog.title', { name: definition.name })}
      icon={<Play className="h-4 w-4" aria-hidden="true" />}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common:buttons.cancel')}
          </Button>
          <Button type="submit" form={formId} isLoading={startRun.isPending} disabled={definition.published_version === null}>
            {t(test ? 'start.dialog.submitTest' : 'start.dialog.submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate>
        {definition.published_version === null ? (
          <Alert type="warning" message={t('start.dialog.notPublished')} className="mb-4" />
        ) : (
          definition.has_unpublished_changes && (
            <Alert type="info" message={t('start.dialog.unpublishedChanges', { version: definition.published_version })} className="mb-4" />
          )
        )}

        {needsSubject && !fixedSubjectId && (
          <Select
            label={t(`start.dialog.subject.${subjectType}`, { defaultValue: subjectName })}
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            required
          >
            <option value="">{t('value.choose')}</option>
            {subjectType === 'client' ? (
              <ClientOptions />
            ) : subjectType === 'project' ? (
              <ProjectOptions />
            ) : subjectType === 'invoice' ? (
              <InvoiceOptions />
            ) : (
              <SubjectOptions type={subjectType} />
            )}
          </Select>
        )}

        {hasPeriod && (
          <fieldset className="mb-4">
            <legend className={fieldLabelClass()}>{t('start.dialog.period')}</legend>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                aria-label={t('start.dialog.periodStart')}
                className={fieldClasses()}
                value={periodStart}
                onChange={(event) => setPeriodStart(event.target.value)}
              />
              <input
                type="date"
                aria-label={t('start.dialog.periodEnd')}
                className={fieldClasses()}
                value={periodEnd}
                onChange={(event) => setPeriodEnd(event.target.value)}
              />
            </div>
          </fieldset>
        )}

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-2 focus:ring-brand-500/40 dark:border-gray-600 dark:bg-gray-900"
            checked={test}
            onChange={(event) => setTest(event.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">{t('testRun.checkbox')}</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">{t('testRun.hint')}</span>
          </span>
        </label>

        {existingRunId && (
          <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            {t('start.dialog.runExists')}{' '}
            <Link to={`/workflows/runs/${existingRunId}`} onClick={onClose} className="font-medium underline underline-offset-2">
              {t('start.dialog.openExisting')}
            </Link>
          </div>
        )}
        {error && <Alert type="error" message={error} className="mt-4" />}
      </form>
    </Modal>
  );
};
