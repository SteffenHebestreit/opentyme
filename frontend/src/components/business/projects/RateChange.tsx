/**
 * @fileoverview Building blocks for changing a project's hourly rate from a date.
 *
 * A rate change is always "this rate, from this day". These pieces make both
 * halves explicit wherever a rate can be changed — the rate timeline, the
 * project form and a contract extension — and say what the change will do
 * BEFORE it is saved:
 *
 * - {@link EffectiveDateField}: the start date, with one-click picks for the
 *   dates rate changes actually start on (today, the 1st of next month, 1 Jan).
 * - {@link RateImpactPanel}: before → after with the percentage, where the new
 *   rate ends, and — the case that matters for contract extensions signed after
 *   the fact — which already-logged entries fall into the new period, with an
 *   explicit opt-in to move them onto the new rate.
 *
 * @module components/business/projects/RateChange
 */

import { FC, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, ArrowRight, CalendarClock, Info } from 'lucide-react';
import { Input } from '@/components/forms';
import { useRateImpact } from '@/hooks/api/useProjectRates';
import type { RateImpact } from '@/api/services/project-rate.service';
import { formatCurrency } from '@/utils/currency';
import { addDaysYmd, firstOfNextMonthYmd, formatYmd, nextNewYearYmd, todayYmd } from '@/utils/date';
import { formatPercentChange, rateChangePercent } from '@/utils/rates';

/**
 * Start-date input with quick picks.
 *
 * Rate changes start on a handful of predictable days, so offering them as
 * one-click chips removes most date typing — and makes "from today" a visible
 * choice instead of a silent default.
 */
export const EffectiveDateField: FC<{
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  error?: string;
}> = ({ id, value, onChange, label, error }) => {
  const { t, i18n } = useTranslation('projects');
  const nextMonth = firstOfNextMonthYmd();
  const newYear = nextNewYearYmd();

  const picks = [
    { key: 'today', value: todayYmd(), label: t('rates.quick.today') },
    {
      key: 'nextMonth',
      value: nextMonth,
      label: t('rates.quick.date', { date: formatYmd(nextMonth, i18n.language) }),
    },
    // 1 January is only worth a separate chip when it is not next month anyway.
    ...(newYear !== nextMonth
      ? [{ key: 'newYear', value: newYear, label: t('rates.quick.date', { date: formatYmd(newYear, i18n.language) }) }]
      : []),
  ];

  return (
    <div>
      <Input
        id={id}
        type="date"
        label={label ?? t('rates.form.validFrom.label')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        error={error}
      />
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t('rates.quick.label')}>
        {picks.map((pick) => (
          <button
            key={pick.key}
            type="button"
            onClick={() => onChange(pick.value)}
            className={clsx(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              value === pick.value
                ? 'border-purple-500 bg-purple-100 text-purple-800 dark:border-purple-400 dark:bg-purple-900/40 dark:text-purple-200'
                : 'border-gray-300 text-gray-600 hover:border-purple-400 hover:text-purple-700 dark:border-gray-700 dark:text-gray-300 dark:hover:border-purple-500 dark:hover:text-purple-300'
            )}
          >
            {pick.label}
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * Says what a rate change will do before it is saved.
 *
 * Fetches a preview for the chosen start date and shows:
 * - before → after with the percentage
 * - when it takes effect (a future date is scheduled, not immediate)
 * - where it ends, if a later rate is already agreed
 * - a period already starting that day, which the change replaces
 * - entries already logged in the new period, with an opt-in checkbox to move
 *   them onto the new rate, and a warning when invoices were issued since —
 *   entries are not linked to invoices, so that is the honest signal
 */
export const RateImpactPanel: FC<{
  projectId: string | undefined;
  currency: string;
  newRate: number | null;
  validFrom: string;
  /** The period being edited — not a "replacement" of itself. */
  editingPeriodId?: string | null;
  applyToExisting: boolean;
  onApplyToExistingChange: (value: boolean) => void;
  /** Reports the preview, so the owner can replace a same-day period instead of failing. */
  onImpact?: (impact: RateImpact | null) => void;
}> = ({
  projectId,
  currency,
  newRate,
  validFrom,
  editingPeriodId,
  applyToExisting,
  onApplyToExistingChange,
  onImpact,
}) => {
  const { t, i18n } = useTranslation('projects');
  const lng = i18n.language;
  const { data: impact, isFetching } = useRateImpact(projectId, validFrom);

  useEffect(() => {
    onImpact?.(impact ?? null);
  }, [impact, onImpact]);

  if (!projectId || !validFrom) {
    return null;
  }

  if (!impact) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
        {isFetching ? t('rates.impact.loading') : null}
      </p>
    );
  }

  const isFuture = validFrom > todayYmd();
  // A period already starting that day is replaced by this one — unless it IS
  // the period being edited.
  const replacing =
    impact.existing_period && impact.existing_period.id !== editingPeriodId ? impact.existing_period : null;
  const previous = impact.previous_rate;
  const percent = rateChangePercent(previous, newRate);
  const hasRate = newRate !== null && !Number.isNaN(newRate);

  return (
    <div className="space-y-3" aria-live="polite">
      {/* Before → after */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 dark:border-purple-800/60 dark:bg-purple-900/20">
        {previous !== null ? (
          <>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {formatCurrency(previous, currency)}
            </span>
            <ArrowRight className="h-4 w-4 text-purple-500" aria-hidden="true" />
          </>
        ) : null}
        <span className="text-lg font-semibold text-gray-900 dark:text-white">
          {hasRate ? formatCurrency(newRate as number, currency) : '—'}
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">{t('rates.perHour')}</span>
        </span>
        {percent !== null && Math.abs(percent) >= 0.05 ? (
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 text-xs font-semibold',
              percent > 0
                ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
            )}
          >
            {formatPercentChange(percent, lng)}
          </span>
        ) : null}
        <span className="w-full text-xs text-gray-600 dark:text-gray-400 sm:w-auto sm:ml-auto">
          {impact.period_end
            ? t('rates.impact.range', {
                from: formatYmd(validFrom, lng),
                until: formatYmd(addDaysYmd(impact.period_end, -1), lng),
              })
            : t('rates.impact.from', { from: formatYmd(validFrom, lng) })}
        </span>
      </div>

      {/* What happens to work already logged in the new period — the part that
          matters most, so it sits right under before → after, not at the end. */}
      {impact.logged.count > 0 ? (
        <div
          className={clsx(
            'rounded-lg border px-4 py-3',
            applyToExisting
              ? 'border-green-200 bg-green-50 dark:border-green-800/60 dark:bg-green-900/20'
              : 'border-amber-200 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-900/20'
          )}
        >
          <p className={clsx('text-sm font-medium', applyToExisting ? 'text-green-900 dark:text-green-100' : 'text-amber-900 dark:text-amber-100')}>
            {applyToExisting && impact.logged.following > 0
              ? t('rates.impact.willMove', {
                  count: impact.logged.following,
                  hours: new Intl.NumberFormat(lng, { maximumFractionDigits: 2 }).format(impact.logged.hours),
                  date: formatYmd(validFrom, lng),
                  rate: hasRate ? formatCurrency(newRate as number, currency) : '—',
                })
              : t('rates.impact.willKeep', {
                  count: impact.logged.count,
                  date: formatYmd(validFrom, lng),
                })}
          </p>
          {impact.logged.deviating > 0 ? (
            <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">
              {t('rates.impact.deviating', { count: impact.logged.deviating })}
            </p>
          ) : null}
          {impact.logged.following > 0 ? (
            <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-gray-400 text-purple-600 focus:ring-purple-500"
                checked={!applyToExisting}
                onChange={(event) => onApplyToExistingChange(!event.target.checked)}
              />
              <span>{t('rates.impact.keepExisting')}</span>
            </label>
          ) : null}
          {impact.invoices_since > 0 ? (
            <p className="mt-2 flex items-start gap-2 text-xs font-medium text-red-700 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t('rates.impact.invoicesSince', {
                count: impact.invoices_since,
                date: formatYmd(validFrom, lng),
              })}
            </p>
          ) : null}
        </div>
      ) : !isFuture ? (
        <p className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
          {t('rates.impact.noLogged')}
        </p>
      ) : null}

      {isFuture ? (
        <p className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" aria-hidden="true" />
          {previous !== null
            ? t('rates.impact.scheduled', {
                date: formatYmd(validFrom, lng),
                previous: formatCurrency(previous, currency),
              })
            : t('rates.impact.scheduledNoPrevious', { date: formatYmd(validFrom, lng) })}
        </p>
      ) : null}

      {impact.period_end ? (
        <p className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
          {t('rates.impact.endsAt', { date: formatYmd(impact.period_end, lng) })}
        </p>
      ) : null}

      {replacing ? (
        <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t('rates.impact.replaces', {
            date: formatYmd(validFrom, lng),
            rate: formatCurrency(replacing.hourly_rate, currency),
          })}
        </p>
      ) : null}

    </div>
  );
};
