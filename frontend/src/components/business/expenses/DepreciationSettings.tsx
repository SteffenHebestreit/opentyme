import { useId } from 'react';
import { Calculator, Info } from 'lucide-react';
import { CustomSelect } from '@/components/forms';
import { fieldClasses, fieldLabelClass } from '@/components/forms/fieldStyles';
import { useTranslation } from 'react-i18next';

interface DepreciationSettingsProps {
  depreciationType: 'none' | 'immediate' | 'partial' | null;
  depreciationYears?: number | null;
  depreciationMethod?: 'linear' | 'degressive' | null;
  onChange: (field: string, value: any) => void;
}

export function DepreciationSettings({
  depreciationType,
  depreciationYears,
  depreciationMethod,
  onChange,
}: DepreciationSettingsProps) {
  const { t } = useTranslation('expenses');
  const yearsId = useId();

  const depreciationTypeOptions = [
    { value: 'none', label: t('depreciation.types.none', 'Keine') },
    { value: 'immediate', label: t('depreciation.types.immediate', 'Sofortabschreibung (GWG < 800€)') },
    { value: 'partial', label: t('depreciation.types.partial', 'Teilabschreibung (Anteilig)') },
  ];

  const depreciationMethodOptions = [
    { value: 'linear', label: t('depreciation.methods.linear', 'Linear') },
    // Must stay 'degressive': both expenses_depreciation_method_check and the
    // Joi update schema reject anything else.
    { value: 'degressive', label: t('depreciation.methods.degressive', 'Declining Balance') },
  ];

  const info =
    depreciationType === 'immediate'
      ? t('depreciation.immediateInfo', 'This expense will be fully deducted in the current tax year.')
      : depreciationType === 'partial' && depreciationYears
      ? t('depreciation.partialInfo', `This expense will be depreciated over ${depreciationYears} years using ${depreciationMethod || 'linear'} method.`)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('depreciation.title', 'Depreciation (AfA)')}
        </h3>
      </div>

      <CustomSelect
        label={t('depreciation.type', 'Depreciation Type')}
        options={depreciationTypeOptions}
        value={depreciationType || 'none'}
        onChange={(value) => onChange('depreciation_type', value)}
      />

      {depreciationType === 'partial' && (
        <div className="grid animate-fade-in grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={yearsId} className={fieldLabelClass()}>
              {t('depreciation.years', 'Depreciation Years')}
            </label>
            <input
              id={yearsId}
              type="number"
              min="1"
              max="20"
              value={depreciationYears || ''}
              onChange={(e) => onChange('depreciation_years', parseInt(e.target.value) || null)}
              className={`${fieldClasses()} tabular-nums`}
              placeholder={t('depreciation.yearsPlaceholder', 'Enter number of years')}
            />
          </div>

          <CustomSelect
            label={t('depreciation.method', 'Depreciation Method')}
            options={depreciationMethodOptions}
            value={depreciationMethod || 'linear'}
            onChange={(value) => onChange('depreciation_method', value)}
          />
        </div>
      )}

      {/* Asset category is now automatically determined from expense category - no manual selection needed */}

      {info && (
        <p
          key={depreciationType ?? 'none'}
          className="flex animate-fade-in items-start gap-2 text-xs text-gray-500 dark:text-gray-400"
        >
          <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{info}</span>
        </p>
      )}
    </div>
  );
}
