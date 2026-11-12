/**
 * The right-hand side of the editor: settings of the selected node or edge,
 * generated from the catalog — or the flow's own name and description when
 * nothing is selected.
 */
import { FC, ReactNode, useMemo } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Button } from '../../common/Button';
import { fieldClasses, fieldHelperClass, fieldLabelClass } from '../../forms/fieldStyles';
import { useClients } from '../../../hooks/api/useClients';
import { useProjects } from '../../../hooks/api/useProjects';
import type {
  ActionNodeData,
  EndNodeData,
  GatewayNodeData,
  StartNodeData,
  TaskNodeData,
  WaitNodeData,
  WorkflowCatalog,
  WorkflowFormField,
  WorkflowIssue,
  WorkflowSchedule,
  WorkflowSubjectType,
  WorkflowTaskKind,
  WorkflowValue,
} from '../../../api/types/workflow.types';
import { WORKFLOW_TASK_KINDS } from '../../../api/types/workflow.types';
import { gatewayEdges } from '../graph/flowGraph';
import type { AnyNodeData, FlowEdge, FlowNode } from '../graph/flowGraph';
import { referenceOptions } from '../graph/references';
import type { ReferenceOption } from '../graph/references';
import { useWorkflowLabels } from '../useWorkflowLabels';
import type { WorkflowLabels } from '../useWorkflowLabels';
import { ConditionEditor } from './ConditionEditor';
import { ValueField } from './ValueField';
import type { ReferenceNaming } from './ValueField';

interface PropertiesPanelProps {
  subjectType: WorkflowSubjectType;
  name: string;
  description: string;
  onMetaChange: (patch: { name?: string; description?: string }) => void;
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNode?: FlowNode;
  selectedEdge?: FlowEdge;
  catalog?: WorkflowCatalog;
  issues: WorkflowIssue[];
  onNodeConfig: (nodeId: string, config: AnyNodeData) => void;
  onEdgeData: (edgeId: string, data: NonNullable<FlowEdge['data']>) => void;
  onMoveEdge: (edgeId: string, direction: -1 | 1) => void;
  onSelectEdge: (edgeId: string) => void;
  onDeleteSelected: () => void;
}

const control = fieldClasses({ size: 'sm' });

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className={fieldLabelClass()}>
        {label}
      </label>
      {children}
      {hint && <p className={fieldHelperClass}>{hint}</p>}
    </div>
  );
}

function TextField({ id, label, value, onChange, hint, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; hint?: string; placeholder?: string }) {
  return (
    <Field id={id} label={label} hint={hint}>
      <input id={id} type="text" className={control} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function NumberField({ id, label, value, onChange, hint, min = 0, max }: { id: string; label: string; value: number | undefined; onChange: (value: number | undefined) => void; hint?: string; min?: number; max?: number }) {
  return (
    <Field id={id} label={label} hint={hint}>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        className={control}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? undefined : Math.max(min, Number(event.target.value)))}
      />
    </Field>
  );
}

function PanelHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: ReactNode }) {
  return (
    <div className="mb-4 border-b border-gray-100 pb-3 dark:border-gray-800">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-0.5 break-words text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
      {detail && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</div>}
    </div>
  );
}

/** Subjects a scheduled start runs for — the user's clients or projects. */
const SubjectChecklist: FC<{ subjectType: 'client' | 'project'; selected: string[]; onChange: (ids: string[]) => void; legend: string; empty: string }> = ({
  subjectType,
  selected,
  onChange,
  legend,
  empty,
}) => {
  const clients = useClients();
  const projects = useProjects();
  const items = subjectType === 'client' ? clients.data ?? [] : projects.data ?? [];
  return (
    <fieldset className="mb-4">
      <legend className={fieldLabelClass()}>{legend}</legend>
      {items.length === 0 ? (
        <p className={fieldHelperClass}>{empty}</p>
      ) : (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-800">
          {items.map((item) => {
            const checked = selected.includes(item.id);
            return (
              <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.04]">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-2 focus:ring-brand-500/40 dark:border-gray-600 dark:bg-gray-900"
                  checked={checked}
                  onChange={() => onChange(checked ? selected.filter((id) => id !== item.id) : [...selected, item.id])}
                />
                <span className="min-w-0 truncate">{item.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
};

const DEFAULT_SCHEDULE: WorkflowSchedule = { dayOfMonth: 'last', period: 'current_month', subjectIds: [] };

function StartSettings({ config, onChange, subjectType, labels }: { config: StartNodeData; onChange: (config: StartNodeData) => void; subjectType: WorkflowSubjectType; labels: WorkflowLabels }) {
  const { t } = labels;
  const schedulable = subjectType === 'client' || subjectType === 'project';
  const schedule = config.schedule ?? DEFAULT_SCHEDULE;
  const setSchedule = (patch: Partial<WorkflowSchedule>) => onChange({ ...config, trigger: 'schedule', schedule: { ...schedule, ...patch } });
  return (
    <>
      <Field id="start-trigger" label={t('start.trigger')} hint={schedulable ? t('start.triggerHint') : t('start.scheduleNeedsSubject')}>
        <select
          id="start-trigger"
          className={cn(control, 'cursor-pointer')}
          value={config.trigger}
          onChange={(event) =>
            event.target.value === 'schedule'
              ? onChange({ ...config, trigger: 'schedule', schedule })
              : onChange({ label: config.label, trigger: 'manual' })
          }
        >
          <option value="manual">{t('start.manual')}</option>
          <option value="schedule" disabled={!schedulable}>
            {t('start.schedule')}
          </option>
        </select>
      </Field>
      {config.trigger === 'schedule' && schedulable && (
        <>
          <Field id="start-day" label={t('start.dayOfMonth')} hint={t('start.dayHint')}>
            <select
              id="start-day"
              className={cn(control, 'cursor-pointer')}
              value={String(schedule.dayOfMonth)}
              onChange={(event) => setSchedule({ dayOfMonth: event.target.value === 'last' ? 'last' : Number(event.target.value) })}
            >
              <option value="last">{t('start.lastDay')}</option>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {t('start.dayN', { day })}
                </option>
              ))}
            </select>
          </Field>
          <Field id="start-period" label={t('start.period')}>
            <select
              id="start-period"
              className={cn(control, 'cursor-pointer')}
              value={schedule.period}
              onChange={(event) => setSchedule({ period: event.target.value === 'previous_month' ? 'previous_month' : 'current_month' })}
            >
              <option value="current_month">{t('start.periodCurrent')}</option>
              <option value="previous_month">{t('start.periodPrevious')}</option>
            </select>
          </Field>
          <SubjectChecklist
            subjectType={subjectType}
            selected={schedule.subjectIds}
            onChange={(subjectIds) => setSchedule({ subjectIds })}
            legend={t(`start.subjects.${subjectType}`)}
            empty={t(`start.noSubjects.${subjectType}`)}
          />
        </>
      )}
    </>
  );
}

function FormFieldsEditor({ fields, onChange, labels }: { fields: WorkflowFormField[]; onChange: (fields: WorkflowFormField[]) => void; labels: WorkflowLabels }) {
  const { t } = labels;
  const setField = (index: number, patch: Partial<WorkflowFormField>) => onChange(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  const slug = (text: string) =>
    text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  return (
    <fieldset className="mb-4">
      <legend className={fieldLabelClass()}>{t('task.fields')}</legend>
      <ol className="space-y-2">
        {fields.map((field, index) => {
          const n = index + 1;
          return (
            <li key={index} className="space-y-2 rounded-lg border border-gray-200 p-2.5 dark:border-gray-800">
              <input
                type="text"
                aria-label={t('task.fieldLabelOf', { n })}
                placeholder={t('task.fieldLabel')}
                className={control}
                value={field.label}
                onChange={(event) => {
                  const label = event.target.value;
                  // The key follows the label until it was edited by hand
                  const followsLabel = !field.key || field.key === slug(field.label);
                  setField(index, followsLabel ? { label, key: slug(label) } : { label });
                }}
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  aria-label={t('task.fieldKeyOf', { n })}
                  placeholder={t('task.fieldKey')}
                  className={cn(control, 'font-mono')}
                  value={field.key}
                  onChange={(event) => setField(index, { key: event.target.value.replace(/[^A-Za-z0-9_]/g, '_') })}
                />
                <select
                  aria-label={t('task.fieldTypeOf', { n })}
                  className={cn(control, 'w-28 shrink-0 cursor-pointer')}
                  value={field.type}
                  onChange={(event) => setField(index, { type: event.target.value as WorkflowFormField['type'] })}
                >
                  {(['text', 'number', 'date', 'boolean'] as const).map((type) => (
                    <option key={type} value={type}>
                      {t(`task.fieldTypes.${type}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 dark:border-gray-600 dark:bg-gray-900"
                    checked={!!field.required}
                    onChange={(event) => setField(index, { required: event.target.checked })}
                  />
                  {t('task.fieldRequired')}
                </label>
                <button
                  type="button"
                  onClick={() => onChange(fields.filter((_, i) => i !== index))}
                  aria-label={t('task.removeField', { n })}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() => onChange([...fields, { key: '', label: '', type: 'text' }])}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand-700 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400 dark:hover:text-brand-300"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t('task.addField')}
      </button>
    </fieldset>
  );
}

export const PropertiesPanel: FC<PropertiesPanelProps> = ({
  subjectType,
  name,
  description,
  onMetaChange,
  nodes,
  edges,
  selectedNode,
  selectedEdge,
  catalog,
  issues,
  onNodeConfig,
  onEdgeData,
  onMoveEdge,
  onSelectEdge,
  onDeleteSelected,
}) => {
  const labels = useWorkflowLabels(catalog);
  const { t } = labels;

  // What the selected node (or the gateway an edge leaves) may refer to
  const referenceOwner = selectedNode?.id ?? selectedEdge?.source;
  const references = useMemo<ReferenceOption[]>(
    () => (referenceOwner ? referenceOptions({ nodeId: referenceOwner, nodes, edges, catalog, subjectType }) : []),
    [referenceOwner, nodes, edges, catalog, subjectType]
  );
  const naming = useMemo<ReferenceNaming>(
    () => ({
      group: (option) => {
        if (option.source.kind === 'variable') return t('references.runData');
        const sourceId = option.source.nodeId;
        const node = nodes.find((candidate) => candidate.id === sourceId);
        return `${labels.nodeTitle(node?.type, node?.data.config)} (${sourceId})`;
      },
      value: labels.referenceValueLabel,
    }),
    [labels, nodes, t]
  );

  // ── Nothing selected: the flow itself ──
  if (!selectedNode && !selectedEdge) {
    return (
      <div>
        <PanelHeading eyebrow={t('panel.flow')} title={name || t('panel.unnamed')} detail={t('panel.subject', { subject: labels.subjectTypeLabel(subjectType) })} />
        <TextField id="flow-name" label={t('panel.name')} value={name} onChange={(value) => onMetaChange({ name: value })} />
        <Field id="flow-description" label={t('panel.description')}>
          <textarea
            id="flow-description"
            rows={3}
            className={fieldClasses({ size: 'sm', multiline: true })}
            value={description}
            onChange={(event) => onMetaChange({ description: event.target.value })}
          />
        </Field>
        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">{t('panel.hint')}</p>
      </div>
    );
  }

  // ── An edge ──
  if (selectedEdge && !selectedNode) {
    const source = nodes.find((node) => node.id === selectedEdge.source);
    const target = nodes.find((node) => node.id === selectedEdge.target);
    const data = selectedEdge.data ?? {};
    const fromGateway = source?.type === 'gateway';
    const handle = selectedEdge.sourceHandle ?? 'out';
    return (
      <div>
        <PanelHeading
          eyebrow={t('panel.connection')}
          title={`${labels.nodeTitle(source?.type, source?.data.config)} → ${labels.nodeTitle(target?.type, target?.data.config)}`}
          detail={!fromGateway && handle !== 'out' ? t('edge.exit', { exit: labels.handleLabel(handle) }) : undefined}
        />
        <TextField
          id="edge-label"
          label={t('edge.label')}
          value={data.label ?? ''}
          onChange={(value) => onEdgeData(selectedEdge.id, { ...data, label: value || undefined })}
          hint={t('edge.labelHint')}
        />
        {fromGateway && (
          <>
            <Field id="edge-kind" label={t('edge.when')} hint={t('edge.orderHint')}>
              <select
                id="edge-kind"
                className={cn(control, 'cursor-pointer')}
                value={data.condition ? 'condition' : 'otherwise'}
                onChange={(event) =>
                  onEdgeData(selectedEdge.id, {
                    ...data,
                    condition: event.target.value === 'condition' ? { match: 'all', rules: [{ left: '', op: 'eq', right: '' }] } : null,
                  })
                }
              >
                <option value="condition">{t('edge.condition')}</option>
                <option value="otherwise">{t('edge.otherwise')}</option>
              </select>
            </Field>
            {data.condition && (
              <ConditionEditor
                condition={data.condition}
                onChange={(condition) => onEdgeData(selectedEdge.id, { ...data, condition })}
                references={references}
                naming={naming}
              />
            )}
          </>
        )}
        <div className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-800">
          <Button type="button" variant="outline" size="sm" onClick={onDeleteSelected} leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
            {t('panel.deleteConnection')}
          </Button>
        </div>
      </div>
    );
  }

  // ── A node ──
  const node = selectedNode as FlowNode;
  const nodeId = node.id;
  const config = node.data.config;
  const setConfig = (next: AnyNodeData) => onNodeConfig(nodeId, next);
  const fieldIssue = (field: string) => {
    const issue = issues.find((candidate) => candidate.nodeId === nodeId && candidate.field === field);
    return issue ? labels.issueText(issue, { type: node.type, config }) : undefined;
  };
  const nodeIssues = issues.filter((issue) => issue.nodeId === nodeId && !issue.field);
  const labelField = (
    <TextField
      id="node-label"
      label={t('panel.label')}
      value={(config as { label?: string }).label ?? ''}
      onChange={(value) => setConfig({ ...config, label: value || undefined } as AnyNodeData)}
      hint={t('panel.labelHint')}
    />
  );

  let body: ReactNode = null;
  if (node.type === 'start') {
    body = <StartSettings config={config as StartNodeData} onChange={setConfig} subjectType={subjectType} labels={labels} />;
  } else if (node.type === 'action') {
    const action = config as ActionNodeData;
    const spec = catalog?.actions.find((candidate) => candidate.key === action.action);
    const setInput = (key: string, value: WorkflowValue | undefined) => {
      const input = { ...action.input };
      if (value === undefined) delete input[key];
      else input[key] = value;
      setConfig({ ...action, input });
    };
    body = (
      <>
        <p className="mb-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{labels.actionDescription(action.action)}</p>
        <fieldset className="mb-5">
          <legend className={fieldLabelClass()}>{t('mode.title')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['auto', 'approval'] as const).map((mode) => (
              <label
                key={mode}
                className={cn(
                  'cursor-pointer rounded-lg border px-2.5 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-brand-500',
                  action.mode === mode
                    ? 'border-brand-500 bg-brand-50/60 text-gray-900 dark:border-brand-400 dark:bg-brand-500/10 dark:text-white'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600'
                )}
              >
                <input type="radio" name="action-mode" className="sr-only" checked={action.mode === mode} onChange={() => setConfig({ ...action, mode })} />
                <span className="font-medium">{t(`mode.${mode}`)}</span>
              </label>
            ))}
          </div>
          <p className={fieldHelperClass}>{t(action.mode === 'approval' ? 'mode.approvalHint' : spec?.effect === 'external' ? 'mode.autoExternalHint' : 'mode.autoHint')}</p>
        </fieldset>
        {!spec && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{t('panel.unknownAction', { action: action.action })}</p>}
        {(spec?.input ?? []).map((field) => (
          <ValueField
            key={`${nodeId}:${field.key}`}
            id={`input-${field.key}`}
            label={labels.fieldLabel(action.action, field)}
            spec={field}
            value={action.input[field.key]}
            onChange={(value) => setInput(field.key, value)}
            references={references}
            naming={naming}
            documentTypes={catalog?.documentTypes}
            optionLabel={field.type === 'documentType' ? labels.documentTypeLabel : (option) => t(`actions.${action.action}.options.${field.key}.${option}`, { defaultValue: option })}
            error={fieldIssue(field.key)}
          />
        ))}
      </>
    );
  } else if (node.type === 'task') {
    const task = config as TaskNodeData;
    const setKind = (kind: WorkflowTaskKind) => {
      const next: TaskNodeData = { label: task.label, kind, title: task.title, description: task.description, dueInDays: task.dueInDays };
      if (kind === 'upload') next.documentType = task.documentType ?? catalog?.documentTypes?.[0] ?? 'other';
      if (kind === 'form') next.fields = task.fields ?? [];
      setConfig(next);
    };
    body = (
      <>
        <Field id="task-kind" label={t('task.kind')} hint={t(`task.kindHints.${task.kind}`)}>
          <select id="task-kind" className={cn(control, 'cursor-pointer')} value={task.kind} onChange={(event) => setKind(event.target.value as WorkflowTaskKind)}>
            {WORKFLOW_TASK_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {labels.taskKindLabel(kind)}
              </option>
            ))}
          </select>
        </Field>
        <ValueField
          key={`${nodeId}:title`}
          id="task-title"
          label={t('task.title')}
          spec={{ type: 'string', required: true }}
          value={task.title}
          onChange={(value) => setConfig({ ...task, title: typeof value === 'string' ? value : '' })}
          references={references}
          naming={naming}
          literalOnly
          error={fieldIssue('title')}
        />
        <ValueField
          key={`${nodeId}:description`}
          id="task-description"
          label={t('task.description')}
          spec={{ type: 'text' }}
          value={task.description}
          onChange={(value) => setConfig({ ...task, description: typeof value === 'string' ? value : undefined })}
          references={references}
          naming={naming}
          literalOnly
        />
        {task.kind === 'upload' && (
          <Field id="task-document-type" label={t('task.documentType')} hint={t('task.documentTypeHint')}>
            <select
              id="task-document-type"
              className={cn(control, 'cursor-pointer')}
              value={task.documentType ?? ''}
              onChange={(event) => setConfig({ ...task, documentType: event.target.value || undefined })}
            >
              {(catalog?.documentTypes ?? []).map((type) => (
                <option key={type} value={type}>
                  {labels.documentTypeLabel(type)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {task.kind === 'form' && <FormFieldsEditor fields={task.fields ?? []} onChange={(fields) => setConfig({ ...task, fields })} labels={labels} />}
        <NumberField
          id="task-due"
          label={t('task.dueInDays')}
          value={task.dueInDays}
          min={1}
          onChange={(value) => setConfig({ ...task, dueInDays: value })}
          hint={t('task.dueHint')}
        />
      </>
    );
  } else if (node.type === 'wait') {
    const wait = config as WaitNodeData;
    body = (
      <div className="grid grid-cols-2 gap-3">
        <NumberField id="wait-days" label={t('wait.daysLabel')} value={wait.days} onChange={(value) => setConfig({ ...wait, days: value })} />
        <NumberField id="wait-hours" label={t('wait.hoursLabel')} value={wait.hours} max={23} onChange={(value) => setConfig({ ...wait, hours: value })} />
      </div>
    );
  } else if (node.type === 'gateway') {
    const exits = gatewayEdges(nodeId, edges);
    body = (
      <div className="mb-4">
        <p className={fieldLabelClass()}>{t('gateway.exits')}</p>
        {exits.length === 0 ? (
          <p className={fieldHelperClass}>{t('gateway.noExits')}</p>
        ) : (
          <ol className="space-y-1.5">
            {exits.map((edge, index) => {
              const target = nodes.find((candidate) => candidate.id === edge.target);
              const summary = edge.data?.label?.trim() || labels.conditionSummary(edge.data?.condition);
              return (
                <li key={edge.id} className="flex items-center gap-1 rounded-lg border border-gray-200 py-1 pl-2.5 pr-1 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => onSelectEdge(edge.id)}
                    className="min-w-0 flex-1 rounded text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <span className="block truncate font-medium text-gray-900 dark:text-white">
                      {index + 1}. {summary}
                    </span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">→ {labels.nodeTitle(target?.type, target?.data.config)}</span>
                  </button>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => onMoveEdge(edge.id, -1)}
                    aria-label={t('gateway.moveUp', { n: index + 1 })}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-white/5"
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={index === exits.length - 1}
                    onClick={() => onMoveEdge(edge.id, 1)}
                    aria-label={t('gateway.moveDown', { n: index + 1 })}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-white/5"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <p className={fieldHelperClass}>{t('gateway.hint')}</p>
      </div>
    );
  } else if (node.type === 'end') {
    const end = config as EndNodeData;
    body = (
      <ValueField
        key={`${nodeId}:result`}
        id="end-result"
        label={t('end.result')}
        spec={{ type: 'text' }}
        value={end.result}
        onChange={(value) => setConfig({ ...end, result: typeof value === 'string' ? value : undefined })}
        references={references}
        naming={naming}
        literalOnly
      />
    );
  }

  const title =
    node.type === 'action'
      ? labels.actionTitle((config as ActionNodeData).action)
      : node.type === 'gateway'
        ? (config as GatewayNodeData).label || labels.nodeTypeLabel('gateway')
        : labels.nodeTitle(node.type, config);

  return (
    <div>
      <PanelHeading
        eyebrow={labels.nodeTypeLabel(node.type ?? 'action')}
        title={title}
        detail={
          <>
            {t('panel.id')} <code className="font-mono text-gray-700 dark:text-gray-300">{nodeId}</code>
          </>
        }
      />
      {nodeIssues.length > 0 && (
        <ul className="mb-4 space-y-1 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
          {nodeIssues.map((issue, index) => (
            <li key={index}>{labels.issueText(issue, { type: node.type, config })}</li>
          ))}
        </ul>
      )}
      {labelField}
      {body}
      <div className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-800">
        <Button type="button" variant="outline" size="sm" onClick={onDeleteSelected} leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
          {t('panel.deleteNode')}
        </Button>
      </div>
    </div>
  );
};
