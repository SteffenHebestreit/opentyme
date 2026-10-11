import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Trash2 } from 'lucide-react';
import { fieldClasses } from '@/components/forms/fieldStyles';
import { cn } from '@/lib/cn';

/**
 * Value to send for a write-only secret: `undefined` = keep the stored one,
 * `null` = remove it, a string = replace it.
 */
export type SecretChange = string | null | undefined;

interface SecretFieldProps {
  id: string;
  /** Whether the server has a value stored (it never sends the value itself) */
  isSet: boolean;
  change: SecretChange;
  onChange: (change: SecretChange) => void;
  placeholder?: string;
}

/**
 * Input for an API key the server keeps write-only: shows "stored" with
 * replace / remove instead of the secret, and only sends what the user changed.
 */
export function SecretField({ id, isSet, change, onChange, placeholder }: SecretFieldProps) {
  const { t } = useTranslation('settings');
  const [editing, setEditing] = useState(false);

  if (isSet && change === undefined && !editing) {
    return (
      <div className="flex items-center gap-2">
        <div className={cn(fieldClasses(), 'flex items-center gap-2 bg-gray-50 text-gray-500 dark:bg-gray-900/40 dark:text-gray-400')}>
          <KeyRound className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span className="truncate">{t('admin.general.secretStored', 'Stored')}</span>
          <span className="tracking-widest" aria-hidden="true">••••••••</span>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-lg px-2.5 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300 dark:hover:bg-brand-500/10"
        >
          {t('admin.general.secretReplace', 'Replace')}
        </button>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          aria-label={t('admin.general.secretRemove', 'Remove stored key')}
          title={t('admin.general.secretRemove', 'Remove stored key')}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (change === null) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:text-red-300">
        <span className="flex-1">{t('admin.general.secretWillBeRemoved', 'The stored key will be removed when you save.')}</span>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="shrink-0 font-medium underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {t('admin.general.secretUndo', 'Undo')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="password"
        value={change ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        className={fieldClasses()}
        placeholder={placeholder}
        autoComplete="new-password"
        autoFocus={editing}
      />
      {isSet && (
        <button
          type="button"
          onClick={() => {
            onChange(undefined);
            setEditing(false);
          }}
          className="shrink-0 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-300 dark:hover:bg-white/5"
        >
          {t('admin.general.secretKeep', 'Keep stored')}
        </button>
      )}
    </div>
  );
}
