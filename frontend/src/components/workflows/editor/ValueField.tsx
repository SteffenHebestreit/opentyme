/**
 * One configurable value of a node: either typed in ("Value") or taken from
 * the run's data ("Run data") — the subject's variables or the output of an
 * earlier step. Only references of a fitting type are offered; text fields
 * can also embed `{{path}}` placeholders.
 */
import { FC, ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { fieldClasses, fieldErrorClass, fieldHelperClass, fieldLabelClass } from '../../forms/fieldStyles';
import { ClientOptions, EmailTemplateOptions, InvoiceOptions, ProjectOptions } from '../EntityOptions';
import type { WorkflowFieldSpec, WorkflowValue } from '../../../api/types/workflow.types';
import { allowsPlaceholders, isRef, isReferenceOnly, refOf, referencesFor } from '../graph/references';
import type { ReferenceOption } from '../graph/references';

export interface ReferenceNaming {
  /** Heading a reference is listed under: "Run data" or the step it comes from. */
  group: (option: ReferenceOption) => string;
  /** The value's own name, e.g. "Document". */
  value: (option: ReferenceOption) => string;
}

const controlClass = (error?: boolean) => fieldClasses({ size: 'sm', error });

/** References as <optgroup>s, in the order they were computed (run data first, then steps in graph order). */
export const ReferenceOptions: FC<{ options: ReferenceOption[]; naming: ReferenceNaming }> = ({ options, naming }) => {
  const groups: Array<{ label: string; items: ReferenceOption[] }> = [];
  for (const option of options) {
    const label = naming.group(option);
    const group = groups.find((candidate) => candidate.label === label);
    if (group) group.items.push(option);
    else groups.push({ label, items: [option] });
  }
  return (
    <>
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.items.map((option) => (
            <option key={option.path} value={option.path}>
              {naming.value(option)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
};

interface ValueFieldProps {
  id: string;
  label: string;
  spec: Pick<WorkflowFieldSpec, 'type' | 'required' | 'options'>;
  value: WorkflowValue | undefined;
  onChange: (value: WorkflowValue | undefined) => void;
  /** Everything the node may refer to (not yet filtered by type). */
  references: ReferenceOption[];
  naming: ReferenceNaming;
  /** How a document type is called (for `documentType` fields). */
  optionLabel?: (option: string) => string;
  documentTypes?: string[];
  /** Text that is always typed (a title, a message) — placeholders yes, a whole-value reference no. */
  literalOnly?: boolean;
  /**
   * <option>s to pick the value from instead of typing it — for an id the catalog has no field type of its own
   * for (a record of an addon's subject).
   */
  literalOptions?: ReactNode;
  error?: string;
}

export const ValueField: FC<ValueFieldProps> = ({
  id,
  label,
  spec,
  value,
  onChange,
  references,
  naming,
  optionLabel,
  documentTypes,
  literalOnly = false,
  literalOptions,
  error,
}) => {
  const { t } = useTranslation('workflows');
  const compatible = referencesFor(spec.type, references);
  const referenceOnly = isReferenceOnly(spec.type);
  const [mode, setMode] = useState<'literal' | 'reference'>(isRef(value) || referenceOnly ? 'reference' : 'literal');

  const switchMode = (next: 'literal' | 'reference') => {
    if (next === mode) return;
    setMode(next);
    onChange(undefined);
  };

  const referenceSelect = (current: string, onPick: (path: string) => void, placeholder: string, selectId = id) => (
    <select id={selectId} className={cn(controlClass(!!error), 'cursor-pointer')} value={current} onChange={(event) => onPick(event.target.value)}>
      <option value="">{placeholder}</option>
      <ReferenceOptions options={compatible} naming={naming} />
      {/* A reference that is no longer upstream stays visible, so it can be noticed and replaced */}
      {current && !compatible.some((option) => option.path === current) && <option value={current}>{current}</option>}
    </select>
  );

  let editor: ReactNode;
  if (spec.type === 'documents') {
    const selected = (Array.isArray(value) ? value : []).filter(isRef).map((entry) => entry.$ref);
    const remaining = compatible.filter((option) => !selected.includes(option.path));
    editor = (
      <div className="space-y-2">
        {selected.length > 0 && (
          <ul className="space-y-1">
            {selected.map((path) => {
              const option = compatible.find((candidate) => candidate.path === path);
              return (
                <li key={path} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-sm dark:bg-white/[0.04]">
                  <span className="min-w-0 truncate text-gray-800 dark:text-gray-200">
                    {option ? `${naming.group(option)} › ${naming.value(option)}` : path}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = selected.filter((entry) => entry !== path).map(refOf);
                      onChange(next.length > 0 ? next : undefined);
                    }}
                    aria-label={t('value.removeReference', { name: option ? naming.value(option) : path })}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-white/10 dark:hover:text-gray-200"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {/* Hidden once every fitting document is attached; the list above says what is */}
        {(remaining.length > 0 || selected.length === 0) && (
          <select
            id={id}
            className={cn(controlClass(!!error), 'cursor-pointer')}
            value=""
            disabled={remaining.length === 0}
            onChange={(event) => event.target.value && onChange([...selected, event.target.value].map(refOf))}
          >
            <option value="">{remaining.length === 0 ? t('value.noReferences') : t('value.addDocument')}</option>
            <ReferenceOptions options={remaining} naming={naming} />
          </select>
        )}
      </div>
    );
  } else if (mode === 'reference') {
    editor = referenceSelect(isRef(value) ? value.$ref : '', (path) => onChange(path ? refOf(path) : undefined), compatible.length === 0 ? t('value.noReferences') : t('value.chooseReference'));
  } else if (literalOptions) {
    editor = (
      <select
        id={id}
        className={cn(controlClass(!!error), 'cursor-pointer')}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">{t('value.choose')}</option>
        {literalOptions}
      </select>
    );
  } else {
    const text = typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
    switch (spec.type) {
      case 'boolean':
        editor = (
          <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              id={id}
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-2 focus:ring-brand-500/40 dark:border-gray-600 dark:bg-gray-900"
              checked={value === true}
              onChange={(event) => onChange(event.target.checked)}
            />
            {value === true ? t('value.yes') : t('value.no')}
          </label>
        );
        break;
      case 'number':
        editor = (
          <input
            id={id}
            type="number"
            className={controlClass(!!error)}
            value={typeof value === 'number' ? value : ''}
            onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
          />
        );
        break;
      case 'date':
        editor = <input id={id} type="date" className={controlClass(!!error)} value={text} onChange={(event) => onChange(event.target.value || undefined)} />;
        break;
      case 'text':
        editor = <textarea id={id} rows={3} className={fieldClasses({ size: 'sm', error: !!error, multiline: true })} value={text} onChange={(event) => onChange(event.target.value || undefined)} />;
        break;
      case 'select':
      case 'documentType':
      case 'client':
      case 'project':
      case 'invoice':
      case 'emailTemplate':
        editor = (
          <select id={id} className={cn(controlClass(!!error), 'cursor-pointer')} value={text} onChange={(event) => onChange(event.target.value || undefined)}>
            <option value="">{t('value.choose')}</option>
            {spec.type === 'select' && (spec.options ?? []).map((option) => <option key={option} value={option}>{optionLabel?.(option) ?? option}</option>)}
            {spec.type === 'documentType' && (documentTypes ?? []).map((option) => <option key={option} value={option}>{optionLabel?.(option) ?? option}</option>)}
            {spec.type === 'client' && <ClientOptions />}
            {spec.type === 'project' && <ProjectOptions />}
            {spec.type === 'invoice' && <InvoiceOptions />}
            {spec.type === 'emailTemplate' && <EmailTemplateOptions />}
          </select>
        );
        break;
      default:
        editor = (
          <input
            id={id}
            type="text"
            inputMode={spec.type === 'email' ? 'email' : undefined}
            className={controlClass(!!error)}
            value={text}
            onChange={(event) => onChange(event.target.value || undefined)}
          />
        );
    }
  }

  const showToggle = !literalOnly && !referenceOnly && spec.type !== 'documents' && (compatible.length > 0 || mode === 'reference');
  const placeholders = mode === 'literal' && !literalOptions && allowsPlaceholders(spec.type) ? referencesFor('text', references) : [];

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={id} className={cn(fieldLabelClass(!!error), 'mb-0')}>
          {label}
          {spec.required && <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>}
        </label>
        {showToggle && (
          <div className="inline-flex shrink-0 rounded-md bg-gray-100 p-0.5 dark:bg-white/[0.06]" role="group" aria-label={t('value.sourceOf', { field: label })}>
            {(['literal', 'reference'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => switchMode(option)}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  mode === option
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white'
                    : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                )}
              >
                {t(option === 'literal' ? 'value.literal' : 'value.reference')}
              </button>
            ))}
          </div>
        )}
      </div>
      {editor}
      {placeholders.length > 0 && (
        <select
          aria-label={t('value.insertPlaceholderFor', { field: label })}
          className="mt-1.5 block w-full cursor-pointer rounded-md border-0 bg-transparent px-0 py-0.5 text-xs text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400"
          value=""
          onChange={(event) => {
            if (!event.target.value) return;
            const current = typeof value === 'string' ? value : '';
            onChange(`${current}{{${event.target.value}}}`);
          }}
        >
          <option value="">{t('value.insertPlaceholder')}</option>
          <ReferenceOptions options={placeholders} naming={naming} />
        </select>
      )}
      {error ? <p className={fieldErrorClass}>{error}</p> : referenceOnly && compatible.length === 0 ? <p className={fieldHelperClass}>{t('value.referenceOnlyHint')}</p> : null}
    </div>
  );
};
