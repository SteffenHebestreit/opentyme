import { FC, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { CustomSelect, DateInput } from '../../forms';
import { addDaysYmd, formatDate, todayYmd } from '../../../utils/date';
import { EXPIRY_CHOICES, ExpiryChoice, expiryToIso } from './apiTokenHelpers';

interface ExpiryFieldProps {
  choice: ExpiryChoice;
  customDate: string;
  onChoiceChange: (choice: ExpiryChoice) => void;
  onCustomDateChange: (ymd: string) => void;
  error?: string;
}

/**
 * Expiry picker for creating or regenerating a token: a few common lifetimes,
 * a custom date, or none — the last one with a visible warning.
 */
export const ExpiryField: FC<ExpiryFieldProps> = ({ choice, customDate, onChoiceChange, onCustomDateChange, error }) => {
  const { t } = useTranslation('settings');
  const selectId = useId();
  const dateId = useId();
  const resolved = expiryToIso(choice, customDate);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <CustomSelect
          id={selectId}
          label={t('admin.apiTokens.form.expiryLabel')}
          value={choice}
          onChange={(value) => onChoiceChange(value as ExpiryChoice)}
          options={EXPIRY_CHOICES.map((value) => ({ value, label: t(`admin.apiTokens.form.expiryOptions.${value}`) }))}
          size="md"
        />
        {choice === 'custom' && (
          <DateInput
            id={dateId}
            label={t('admin.apiTokens.form.customDateLabel')}
            value={customDate}
            min={addDaysYmd(todayYmd(), 1)}
            onChange={(event) => onCustomDateChange(event.target.value)}
            error={error}
          />
        )}
      </div>

      {choice === 'never' ? (
        <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t('admin.apiTokens.form.neverWarning')}
        </p>
      ) : (
        resolved && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('admin.apiTokens.form.expiresOn', { date: formatDate(resolved) })}
          </p>
        )
      )}
    </div>
  );
};
