/**
 * Names for everything the catalog and the graph bring along.
 *
 * Catalog items are translated by key convention, with the server's English
 * text as fallback, so an action a newer server (or an addon) adds still
 * reads sensibly before its translation exists:
 *   workflows:actions.<key>.title | description | fields.<field> | outputs.<key>
 *   workflows:variables.<path>, workflows:issues.<CODE>
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ActionNodeData,
  EndNodeData,
  GatewayNodeData,
  StartNodeData,
  TaskNodeData,
  WaitNodeData,
  WorkflowCatalog,
  WorkflowCondition,
  WorkflowFieldSpec,
  WorkflowHandle,
  WorkflowIssue,
  WorkflowNodeType,
  WorkflowStep,
  WorkflowSubjectType,
} from '../../api/types/workflow.types';
import type { AnyNodeData } from './graph/flowGraph';
import type { ReferenceOption } from './graph/references';

const OP_SYMBOLS: Record<string, string> = { eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤' };

export function useWorkflowLabels(catalog?: WorkflowCatalog) {
  const { t } = useTranslation('workflows');

  return useMemo(() => {
    const actionSpec = (key: string) => catalog?.actions.find((action) => action.key === key);
    const actionTitle = (key: string): string => t(`actions.${key}.title`, { defaultValue: actionSpec(key)?.title ?? key });
    const actionDescription = (key: string): string =>
      t(`actions.${key}.description`, { defaultValue: actionSpec(key)?.description ?? '' });
    const fieldLabel = (actionKey: string, field: Pick<WorkflowFieldSpec, 'key' | 'label'>): string =>
      t(`actions.${actionKey}.fields.${field.key}`, { defaultValue: field.label || field.key });
    /**
     * What went wrong in a step. Errors the engine raises itself carry a code
     * (and, for an input, the action and field) and are translated; anything
     * else — an answer of the API, a mail server — keeps its own text.
     */
    const stepErrorText = (step: Pick<WorkflowStep, 'error' | 'error_code' | 'error_params'>): string => {
      const fallback = step.error ?? '';
      if (!step.error_code) return fallback;
      const params = step.error_params ?? {};
      const action = typeof params.action === 'string' ? params.action : '';
      const key = typeof params.field === 'string' ? params.field : '';
      const field = key ? fieldLabel(action, { key, label: typeof params.label === 'string' ? params.label : key }) : '';
      return t(`stepErrors.${step.error_code}`, { ...params, field, defaultValue: fallback });
    };
    const nodeTypeLabel = (type: WorkflowNodeType): string => t(`nodeTypes.${type}`);
    const taskKindLabel = (kind: string): string => t(`taskKinds.${kind}`, { defaultValue: kind });
    const handleLabel = (handle: WorkflowHandle | string): string => t(`handles.${handle}`, { defaultValue: handle });
    const subjectTypeLabel = (type: WorkflowSubjectType): string => t(`subjectTypes.${type}`);
    const documentTypeLabel = (type: string): string => t(`clients:documents.types.${type}`, { defaultValue: type });
    /**
     * A validation issue in the user's language; codes without a translation
     * (or with details only the server knows) keep the server's text. `node`
     * lets an issue about an action's input name the field as the panel does.
     */
    const issueText = (issue: WorkflowIssue, node?: { type?: WorkflowNodeType; config?: AnyNodeData }): string => {
      let field = issue.field ?? '';
      if (field && node?.type === 'action') {
        const actionKey = (node.config as ActionNodeData).action;
        const spec = actionSpec(actionKey)?.input.find((candidate) => candidate.key === field);
        field = fieldLabel(actionKey, spec ?? { key: field, label: field });
      }
      return t(`issues.${issue.code}`, { defaultValue: issue.message, field });
    };

    const waitSummary = (config: WaitNodeData): string => {
      const parts: string[] = [];
      if (config.days) parts.push(t('wait.days', { count: config.days }));
      if (config.hours) parts.push(t('wait.hours', { count: config.hours }));
      return parts.length > 0 ? t('wait.summary', { duration: parts.join(' ') }) : t('nodeTypes.wait');
    };

    /** What a node is called on the canvas and in lists: its own label, else a name derived from what it does. */
    const nodeTitle = (type: WorkflowNodeType | undefined, config: AnyNodeData | undefined): string => {
      const label = (config as { label?: string } | undefined)?.label?.trim();
      if (label) return label;
      switch (type) {
        case 'action':
          return actionTitle((config as ActionNodeData).action);
        case 'task':
          return (config as TaskNodeData).title?.trim() || taskKindLabel((config as TaskNodeData).kind);
        case 'wait':
          return waitSummary(config as WaitNodeData);
        case 'start':
          return (config as StartNodeData).trigger === 'schedule' ? t('start.scheduled') : t('nodeTypes.start');
        case 'gateway':
          return (config as GatewayNodeData).label || t('nodeTypes.gateway');
        case 'end':
          return (config as EndNodeData).label || t('nodeTypes.end');
        default:
          return '';
      }
    };

    /** The value a reference stands for, e.g. "Billing email" or "Document". */
    const referenceValueLabel = (option: ReferenceOption): string => {
      if (option.source.kind === 'variable') return t(`variables.${option.path}`, { defaultValue: option.label || option.path });
      if (option.source.action) return t(`actions.${option.source.action}.outputs.${option.key}`, { defaultValue: option.label || option.key });
      return t(`taskOutputs.${option.key}`, { defaultValue: option.label || option.key });
    };

    /** Short text of a gateway condition for the edge label, e.g. "totalHours > 0". */
    const conditionSummary = (condition: WorkflowCondition | null | undefined): string => {
      if (!condition || condition.rules.length === 0) return t('edge.otherwise');
      const joiner = ` ${t(condition.match === 'any' ? 'condition.or' : 'condition.and')} `;
      return condition.rules
        .map((rule) => {
          const left = rule.left.split('.').pop() ?? rule.left;
          if (rule.op === 'empty' || rule.op === 'not_empty') return `${left} ${t(`condition.ops.${rule.op}`)}`;
          const op = OP_SYMBOLS[rule.op] ?? t(`condition.ops.${rule.op}`);
          return `${left} ${op} ${rule.right === undefined || rule.right === null ? '' : String(rule.right)}`.trim();
        })
        .join(joiner);
    };

    return {
      t,
      actionTitle,
      actionDescription,
      fieldLabel,
      stepErrorText,
      nodeTypeLabel,
      taskKindLabel,
      handleLabel,
      subjectTypeLabel,
      documentTypeLabel,
      issueText,
      nodeTitle,
      referenceValueLabel,
      conditionSummary,
    };
  }, [t, catalog]);
}

export type WorkflowLabels = ReturnType<typeof useWorkflowLabels>;
