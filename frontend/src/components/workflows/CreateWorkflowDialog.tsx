/**
 * New flow: start from a template the server ships (e.g. "timesheet with
 * signature") or from an empty canvas. The subject type — what a run is about —
 * is fixed here; a template brings its own.
 */
import { FC, FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Workflow } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Modal } from '../ui/Modal';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import { Input, Select } from '../forms';
import { fieldLabelClass } from '../forms/fieldStyles';
import { workflowApiError } from '../../api/services/workflow.service';
import { useCreateWorkflow, useWorkflowTemplates } from '../../hooks/api/useWorkflows';
import { WORKFLOW_SUBJECT_TYPES } from '../../api/types/workflow.types';
import type { WorkflowDefinition, WorkflowSubjectType } from '../../api/types/workflow.types';

interface CreateWorkflowDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (definition: WorkflowDefinition) => void;
}

const BLANK = '';

export const CreateWorkflowDialog: FC<CreateWorkflowDialogProps> = ({ open, onClose, onCreated }) => {
  const { t, i18n } = useTranslation('workflows');
  const formId = useId();
  // The server names a template's blocks in the app's language
  const lang = i18n.language;
  const { data: templates } = useWorkflowTemplates(open, lang);
  const createWorkflow = useCreateWorkflow();
  const [templateKey, setTemplateKey] = useState(BLANK);
  const [name, setName] = useState('');
  const [subjectType, setSubjectType] = useState<WorkflowSubjectType>('client');
  const [nameError, setNameError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const template = templates?.find((candidate) => candidate.key === templateKey);
  const templateName = (key: string, fallback: string) => t(`templates.${key}.name`, { defaultValue: fallback });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!template && !name.trim()) {
      setNameError(t('create.nameRequired'));
      return;
    }
    try {
      const definition = await createWorkflow.mutateAsync(
        template ? { template: template.key, name: name.trim() || undefined, lang } : { name: name.trim(), subject_type: subjectType }
      );
      onCreated(definition);
    } catch (err: unknown) {
      setError(workflowApiError(err).message ?? t('create.error'));
    }
  };

  const choice = (key: string, title: string, description: string) => (
    <label
      key={key || 'blank'}
      className={cn(
        'flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-brand-500',
        templateKey === key
          ? 'border-brand-500 bg-brand-50/60 dark:border-brand-400 dark:bg-brand-500/10'
          : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
      )}
    >
      <input type="radio" name={`${formId}-template`} className="sr-only" checked={templateKey === key} onChange={() => setTemplateKey(key)} />
      <span>
        <span className="block text-sm font-medium text-gray-900 dark:text-white">{title}</span>
        <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{description}</span>
      </span>
    </label>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t('create.title')}
      icon={<Workflow className="h-4 w-4" aria-hidden="true" />}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common:buttons.cancel')}
          </Button>
          <Button type="submit" form={formId} isLoading={createWorkflow.isPending}>
            {t('create.submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} noValidate>
        <fieldset className="mb-5">
          <legend className={fieldLabelClass()}>{t('create.startFrom')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {choice(BLANK, t('create.blank'), t('create.blankHint'))}
            {(templates ?? []).map((candidate) =>
              choice(candidate.key, templateName(candidate.key, candidate.name), t(`templates.${candidate.key}.description`, { defaultValue: candidate.description }))
            )}
          </div>
        </fieldset>

        <Input
          label={t('create.name')}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setNameError(undefined);
          }}
          placeholder={template ? templateName(template.key, template.name) : t('create.namePlaceholder')}
          maxLength={255}
          error={nameError}
          required={!template}
        />

        <Select
          label={t('create.subjectType')}
          value={template ? template.subject_type : subjectType}
          onChange={(event) => setSubjectType(event.target.value as WorkflowSubjectType)}
          disabled={!!template}
          helperText={t('create.subjectTypeHint')}
        >
          {WORKFLOW_SUBJECT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`subjectTypes.${type}`)}
            </option>
          ))}
        </Select>

        {error && <Alert type="error" message={error} />}
      </form>
    </Modal>
  );
};
