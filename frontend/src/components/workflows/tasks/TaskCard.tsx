/**
 * One task of a run and what can be done about it, by kind:
 * confirm (done / reject), upload (a file), form (fields), approval of an
 * action (run it / skip it) and notice (acknowledge).
 */
import { FC, FormEvent, ReactNode, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BellRing, CalendarClock, Check, FileUp, ListChecks, ShieldCheck, SquareCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { confirmDialog } from '../../../lib/confirm';
import { toast } from '../../../lib/toast';
import { Badge } from '../../common/Badge';
import { Button } from '../../common/Button';
import { FileDropZone } from '../../forms/FileDropZone';
import { fieldClasses, fieldErrorClass, fieldLabelClass } from '../../forms/fieldStyles';
import { CLIENT_DOCUMENT_ACCEPT, validateClientDocumentFile } from '../../../api/services/client-document.service';
import { workflowApiError } from '../../../api/services/workflow.service';
import {
  useApproveWorkflowTask,
  useCompleteWorkflowTask,
  useDismissWorkflowTask,
  useRejectWorkflowTask,
  useSkipWorkflowTask,
} from '../../../hooks/api/useWorkflows';
import type { WorkflowFormField, WorkflowTask, WorkflowTaskRecordKind } from '../../../api/types/workflow.types';
import { formatDate, formatDistanceToNow } from '../../../utils/date';
import { TaskStatusBadge, TestRunBadge } from '../WorkflowBadges';

const KIND_ICONS: Record<WorkflowTaskRecordKind, LucideIcon> = {
  confirm: SquareCheck,
  upload: FileUp,
  form: ListChecks,
  approval: ShieldCheck,
  notice: BellRing,
};

interface TaskCardProps {
  task: WorkflowTask;
  /** Hide the "Open run" link — on the run's own page. */
  hideRunLink?: boolean;
}

const control = fieldClasses({ size: 'sm' });

/** Rows the server prepared so an action can be judged before it runs (recipient, subject, attachments …). */
interface PreviewRow {
  /** An input field of the action, or a row of its own (`attachments`, `afterwards` …) */
  key?: string;
  label: string;
  value: string;
  /** The value is a fixed sentence with a translation */
  valueKey?: string;
}

function previewRows(task: WorkflowTask): PreviewRow[] {
  const preview = task.payload?.preview;
  if (!Array.isArray(preview)) return [];
  return preview
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row) => ({
      key: typeof row.key === 'string' ? row.key : undefined,
      label: String(row.label ?? ''),
      value: Array.isArray(row.value) ? row.value.join(', ') : row.value === null || row.value === undefined ? '' : String(row.value),
      valueKey: typeof row.valueKey === 'string' ? row.valueKey : undefined,
    }));
}

function formFields(task: WorkflowTask): WorkflowFormField[] {
  const fields = task.payload?.fields;
  return Array.isArray(fields) ? (fields as WorkflowFormField[]).filter((field) => field && typeof field.key === 'string') : [];
}

export const TaskCard: FC<TaskCardProps> = ({ task, hideRunLink = false }) => {
  const { t } = useTranslation('workflows');
  const formId = useId();
  const complete = useCompleteWorkflowTask();
  const reject = useRejectWorkflowTask();
  const approve = useApproveWorkflowTask();
  const skip = useSkipWorkflowTask();
  const dismiss = useDismissWorkflowTask();

  const [comment, setComment] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [documentTitle, setDocumentTitle] = useState('');
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const open = task.status === 'open';
  const busy = complete.isPending || reject.isPending || approve.isPending || skip.isPending || dismiss.isPending;
  const Icon = KIND_ICONS[task.kind] ?? SquareCheck;
  const overdue = open && !!task.due_at && new Date(task.due_at).getTime() < Date.now();

  /** Runs a task action; failures show the server's reason. */
  const settle = async (action: () => Promise<unknown>, doneMessage: string) => {
    try {
      await action();
      toast.success(doneMessage);
    } catch (err: unknown) {
      toast.error(t('tasks.actionError'), { description: workflowApiError(err).message });
    }
  };

  const handleReject = async () => {
    const confirmed = await confirmDialog({
      title: t('tasks.confirm.rejectTitle'),
      // The engine says whether the flow wires a "rejected" exit; without one the run ends here.
      message:
        task.payload.rejectCancelsRun === true
          ? t('tasks.confirm.rejectCancelsMessage')
          : task.payload.rejectCancelsRun === false
            ? t('tasks.confirm.rejectContinuesMessage')
            : t('tasks.confirm.rejectMessage'),
      confirmLabel: t('tasks.confirm.reject'),
      tone: 'danger',
    });
    if (confirmed) await settle(() => reject.mutateAsync({ id: task.id, comment }), t('tasks.rejected'));
  };

  const handleSkip = async () => {
    const confirmed = await confirmDialog({
      title: t('tasks.approval.skipTitle'),
      message: t('tasks.approval.skipMessage'),
      confirmLabel: t('tasks.approval.skip'),
    });
    if (confirmed) await settle(() => skip.mutateAsync(task.id), t('tasks.skipped'));
  };

  const chooseFile = (picked: File | null) => {
    const problem = picked ? validateClientDocumentFile(picked) : null;
    setFileError(problem ? t(`tasks.upload.errors.${problem}`) : undefined);
    setFile(problem ? null : picked);
  };

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setFileError(t('tasks.upload.errors.required'));
      return;
    }
    await settle(() => complete.mutateAsync({ id: task.id, payload: { file, title: documentTitle } }), t('tasks.uploaded'));
  };

  const fields = task.kind === 'form' ? formFields(task) : [];
  const handleForm = async (event: FormEvent) => {
    event.preventDefault();
    const errors: Record<string, string> = {};
    const result: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = values[field.key];
      if (field.type === 'boolean') {
        result[field.key] = raw === true;
        continue;
      }
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (!text) {
        if (field.required) errors[field.key] = t('tasks.form.required');
        continue;
      }
      result[field.key] = field.type === 'number' ? Number(text) : text;
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    await settle(() => complete.mutateAsync({ id: task.id, payload: { values: result } }), t('tasks.completed'));
  };

  let actions: ReactNode = null;
  if (open) {
    if (task.kind === 'confirm') {
      const commentId = `${formId}-comment`;
      actions = (
        <div className="space-y-3">
          <div>
            <label htmlFor={commentId} className={fieldLabelClass()}>
              {t('tasks.confirm.comment')}
            </label>
            <textarea id={commentId} rows={2} className={fieldClasses({ size: 'sm', multiline: true })} value={comment} onChange={(event) => setComment(event.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              isLoading={complete.isPending}
              disabled={busy}
              leftIcon={<Check className="h-4 w-4" aria-hidden="true" />}
              onClick={() => void settle(() => complete.mutateAsync({ id: task.id, payload: { comment } }), t('tasks.completed'))}
            >
              {t('tasks.confirm.done')}
            </Button>
            <Button type="button" size="sm" variant="outline" isLoading={reject.isPending} disabled={busy} onClick={() => void handleReject()}>
              {t('tasks.confirm.reject')}
            </Button>
          </div>
        </div>
      );
    } else if (task.kind === 'upload') {
      const titleId = `${formId}-title`;
      const documentType = typeof task.payload?.documentType === 'string' ? task.payload.documentType : null;
      actions = (
        <form onSubmit={(event) => void handleUpload(event)} noValidate className="space-y-3">
          {documentType && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('tasks.upload.storedAs', { type: t(`clients:documents.types.${documentType}`, { defaultValue: documentType }) })}
            </p>
          )}
          <FileDropZone
            file={file}
            onFile={chooseFile}
            accept={CLIENT_DOCUMENT_ACCEPT}
            prompt={t('tasks.upload.prompt')}
            hint={t('tasks.upload.hint')}
            changeLabel={t('tasks.upload.change')}
            removeLabel={t('tasks.upload.remove')}
            error={fileError}
          />
          <div>
            <label htmlFor={titleId} className={fieldLabelClass()}>
              {t('tasks.upload.title')}
            </label>
            <input id={titleId} type="text" className={control} value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} maxLength={255} />
          </div>
          <Button type="submit" size="sm" isLoading={complete.isPending} disabled={busy} leftIcon={<FileUp className="h-4 w-4" aria-hidden="true" />}>
            {t('tasks.upload.submit')}
          </Button>
        </form>
      );
    } else if (task.kind === 'form') {
      actions = (
        <form onSubmit={(event) => void handleForm(event)} noValidate className="space-y-3">
          {fields.map((field) => {
            const id = `${formId}-${field.key}`;
            const error = formErrors[field.key];
            if (field.type === 'boolean') {
              return (
                <label key={field.key} htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    id={id}
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-2 focus:ring-brand-500/40 dark:border-gray-600 dark:bg-gray-900"
                    checked={values[field.key] === true}
                    onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.checked }))}
                  />
                  {field.label || field.key}
                </label>
              );
            }
            return (
              <div key={field.key}>
                <label htmlFor={id} className={fieldLabelClass(!!error)}>
                  {field.label || field.key}
                  {field.required && <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>}
                </label>
                <input
                  id={id}
                  type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                  className={fieldClasses({ size: 'sm', error: !!error })}
                  value={typeof values[field.key] === 'string' ? (values[field.key] as string) : ''}
                  aria-invalid={error ? true : undefined}
                  required={field.required}
                  onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                />
                {error && <p className={fieldErrorClass}>{error}</p>}
              </div>
            );
          })}
          <Button type="submit" size="sm" isLoading={complete.isPending} disabled={busy} leftIcon={<Check className="h-4 w-4" aria-hidden="true" />}>
            {t('tasks.form.submit')}
          </Button>
        </form>
      );
    } else if (task.kind === 'approval') {
      const rows = previewRows(task);
      actions = (
        <div className="space-y-3">
          {rows.length > 0 && (
            <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm dark:divide-gray-800 dark:border-gray-800">
              {rows.map((row, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-3 px-3 py-1.5">
                  {/* The server sends English fallbacks; rows it names are shown in the user's language */}
                  <dt className="truncate text-gray-500 dark:text-gray-400">
                    {row.key
                      ? t(`preview.labels.${row.key}`, {
                          defaultValue: t(`actions.${String(task.payload.action ?? '')}.fields.${row.key}`, { defaultValue: row.label }),
                        })
                      : row.label}
                  </dt>
                  <dd className="min-w-0 break-words text-gray-900 dark:text-gray-100">
                    {(row.valueKey ? t(`preview.values.${row.valueKey}`, { defaultValue: row.value }) : row.value) || '—'}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              isLoading={approve.isPending}
              disabled={busy}
              leftIcon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
              onClick={() => void settle(() => approve.mutateAsync(task.id), t('tasks.approved'))}
            >
              {t('tasks.approval.approve')}
            </Button>
            <Button type="button" size="sm" variant="outline" isLoading={skip.isPending} disabled={busy} onClick={() => void handleSkip()}>
              {t('tasks.approval.skip')}
            </Button>
          </div>
        </div>
      );
    } else if (task.kind === 'notice') {
      actions = (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          isLoading={dismiss.isPending}
          disabled={busy}
          leftIcon={<Check className="h-4 w-4" aria-hidden="true" />}
          onClick={() => void settle(() => dismiss.mutateAsync(task.id), t('tasks.dismissed'))}
        >
          {t('tasks.notice.dismiss')}
        </Button>
      );
    }
  }

  return (
    <article className="surface p-4" aria-label={task.title}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            task.kind === 'approval'
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
              : task.kind === 'notice'
                ? 'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400'
                : 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge variant={task.kind === 'approval' ? 'amber' : task.kind === 'notice' ? 'gray' : 'violet'} size="sm">
              {t(`taskKinds.${task.kind}`, { defaultValue: task.kind })}
            </Badge>
            {task.test_mode && <TestRunBadge />}
            {!open && <TaskStatusBadge status={task.status} />}
            {open && task.due_at && (
              <span
                className={cn('inline-flex items-center gap-1 text-xs', overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400')}
              >
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                {t(overdue ? 'tasks.overdueSince' : 'tasks.dueOn', { date: formatDate(task.due_at) })}
              </span>
            )}
          </div>
          <h3 className="mt-1.5 break-words text-sm font-semibold text-gray-900 dark:text-white">{task.title}</h3>
          {task.description && <p className="mt-1 whitespace-pre-line break-words text-sm text-gray-600 dark:text-gray-300">{task.description}</p>}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span>{[task.definition_name, task.subject_label].filter(Boolean).join(' · ')}</span>
            <span aria-hidden="true">·</span>
            <span>{open ? formatDistanceToNow(task.created_at) : formatDistanceToNow(task.completed_at ?? task.created_at)}</span>
            {!hideRunLink && (
              <>
                <span aria-hidden="true">·</span>
                <Link
                  to={`/workflows/runs/${task.run_id}`}
                  className="rounded font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400"
                >
                  {t('tasks.openRun')}
                </Link>
              </>
            )}
          </p>
          {actions && <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">{actions}</div>}
        </div>
      </div>
    </article>
  );
};
