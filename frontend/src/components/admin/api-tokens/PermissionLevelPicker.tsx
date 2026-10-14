import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiTokenLevel } from '../../../api/types';
import { cn } from '../../../lib/cn';

interface PermissionLevelPickerProps {
  /** Radio group name; one per resource */
  name: string;
  value: ApiTokenLevel;
  /** Levels this resource supports, lowest first */
  levels: ApiTokenLevel[];
  onChange: (level: ApiTokenLevel) => void;
  /** id of the element naming the group (the resource label) */
  labelledBy: string;
}

/* Static class names so Tailwind sees them: span and inner columns per level count. */
const SPAN: Record<number, string> = {
  1: 'col-span-1 grid-cols-1',
  2: 'col-span-2 grid-cols-2',
  3: 'col-span-3 grid-cols-3',
  4: 'col-span-4 grid-cols-4',
};

const CHECKED_TONE: Record<ApiTokenLevel, string> = {
  none: 'peer-checked:text-gray-900 dark:peer-checked:text-white',
  read: 'peer-checked:text-blue-700 dark:peer-checked:text-blue-300',
  write: 'peer-checked:text-amber-700 dark:peer-checked:text-amber-300',
  delete: 'peer-checked:text-red-700 dark:peer-checked:text-red-300',
};

/**
 * Segmented None / Read / Write / Delete control. Native radios underneath,
 * so arrow keys move between levels and screen readers announce a radio
 * group. Every row uses the same four columns, so a resource that supports
 * fewer levels (reports: none/read) still lines up with the rest.
 */
export const PermissionLevelPicker: FC<PermissionLevelPickerProps> = ({ name, value, levels, onChange, labelledBy }) => {
  const { t } = useTranslation('settings');

  return (
    <div className="grid w-full grid-cols-4 sm:w-80">
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        className={cn(
          'grid gap-0.5 rounded-lg bg-gray-100 p-0.5 ring-1 ring-inset ring-gray-200 dark:bg-white/[0.04] dark:ring-gray-800',
          SPAN[levels.length]
        )}
      >
        {levels.map((level) => (
          <label key={level} className="relative min-w-0">
            <input
              type="radio"
              name={name}
              value={level}
              checked={value === level}
              onChange={() => onChange(level)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'block cursor-pointer truncate rounded-md px-1.5 py-1 text-center text-xs font-medium text-gray-500 transition-colors',
                'hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200',
                'peer-checked:bg-white peer-checked:shadow-sm peer-checked:ring-1 peer-checked:ring-gray-200',
                'dark:peer-checked:bg-white/10 dark:peer-checked:ring-white/10',
                'peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500',
                CHECKED_TONE[level]
              )}
            >
              {t(`admin.apiTokens.levels.${level}`)}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
};
