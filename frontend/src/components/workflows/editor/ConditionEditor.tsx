/**
 * The condition on a gateway exit: rules over the run's data, clicked
 * together from fields — there is no free-form code anywhere in a flow.
 */
import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { fieldClasses } from '../../forms/fieldStyles';
import { WORKFLOW_CONDITION_OPS } from '../../../api/types/workflow.types';
import type { WorkflowCondition, WorkflowConditionOp, WorkflowConditionRule } from '../../../api/types/workflow.types';
import type { ReferenceOption } from '../graph/references';
import { ReferenceOptions } from './ValueField';
import type { ReferenceNaming } from './ValueField';

interface ConditionEditorProps {
  condition: WorkflowCondition;
  onChange: (condition: WorkflowCondition) => void;
  /** Everything the gateway may refer to. */
  references: ReferenceOption[];
  naming: ReferenceNaming;
}

const control = fieldClasses({ size: 'sm' });
const needsValue = (op: WorkflowConditionOp) => op !== 'empty' && op !== 'not_empty';

export const ConditionEditor: FC<ConditionEditorProps> = ({ condition, onChange, references, naming }) => {
  const { t } = useTranslation('workflows');
  const rules = condition.rules;

  const setRule = (index: number, patch: Partial<WorkflowConditionRule>) =>
    onChange({ ...condition, rules: rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)) });

  return (
    <div className="space-y-3">
      {rules.length > 1 && (
        <div>
          <label htmlFor="condition-match" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            {t('condition.match')}
          </label>
          <select
            id="condition-match"
            className={cn(control, 'cursor-pointer')}
            value={condition.match}
            onChange={(event) => onChange({ ...condition, match: event.target.value === 'any' ? 'any' : 'all' })}
          >
            <option value="all">{t('condition.matchAll')}</option>
            <option value="any">{t('condition.matchAny')}</option>
          </select>
        </div>
      )}

      <ol className="space-y-3">
        {rules.map((rule, index) => {
          const left = references.find((option) => option.path === rule.left);
          const valueType = left?.type;
          const n = index + 1;
          return (
            <li key={index} className="rounded-lg border border-gray-200 p-2.5 dark:border-gray-800">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('condition.rule', { n })}</span>
                <button
                  type="button"
                  onClick={() => onChange({ ...condition, rules: rules.filter((_, i) => i !== index) })}
                  aria-label={t('condition.removeRule', { n })}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <div className="space-y-2">
                <select
                  aria-label={t('condition.leftOf', { n })}
                  className={cn(control, 'cursor-pointer')}
                  value={rule.left}
                  onChange={(event) => setRule(index, { left: event.target.value })}
                >
                  <option value="">{t('value.chooseReference')}</option>
                  <ReferenceOptions options={references} naming={naming} />
                  {rule.left && !left && <option value={rule.left}>{rule.left}</option>}
                </select>
                <select
                  aria-label={t('condition.opOf', { n })}
                  className={cn(control, 'cursor-pointer')}
                  value={rule.op}
                  onChange={(event) => {
                    const op = event.target.value as WorkflowConditionOp;
                    setRule(index, needsValue(op) ? { op } : { op, right: undefined });
                  }}
                >
                  {WORKFLOW_CONDITION_OPS.map((op) => (
                    <option key={op} value={op}>
                      {t(`condition.ops.${op}`)}
                    </option>
                  ))}
                </select>
                {needsValue(rule.op) &&
                  (valueType === 'boolean' ? (
                    <select
                      aria-label={t('condition.rightOf', { n })}
                      className={cn(control, 'cursor-pointer')}
                      value={rule.right === true ? 'true' : 'false'}
                      onChange={(event) => setRule(index, { right: event.target.value === 'true' })}
                    >
                      <option value="true">{t('value.yes')}</option>
                      <option value="false">{t('value.no')}</option>
                    </select>
                  ) : (
                    <input
                      aria-label={t('condition.rightOf', { n })}
                      type={valueType === 'number' ? 'number' : valueType === 'date' ? 'date' : 'text'}
                      className={control}
                      value={rule.right === undefined || rule.right === null ? '' : String(rule.right)}
                      placeholder={t('condition.valuePlaceholder')}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setRule(index, { right: valueType === 'number' && raw !== '' ? Number(raw) : raw });
                      }}
                    />
                  ))}
              </div>
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        onClick={() => onChange({ ...condition, rules: [...rules, { left: '', op: 'eq', right: '' }] })}
        className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand-700 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400 dark:hover:text-brand-300"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t('condition.addRule')}
      </button>
    </div>
  );
};
