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
import { Badge } from '@/components/common/Badge';
import { Input } from '@/components/forms';
import { useRateImpact } from '@/hooks/api/useProjectRates';
import type { RateImpact } from '@/api/services/project-rate.service';
import { formatCurrency } from '@/utils/currency';
import { addDaysYmd, firstOfNextMonthYmd, formatYmd, nextNewYearYmd, todayYmd } from '@/utils/date';
import { formatPercentChange, rateChangePercent } from '@/utils/rates';
import { checkboxClass, chipClass } from './uiClasses';

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
      {/* The field brings its own bottom margin — pull the picks up under it. */}
      <div className="-mt-2 mb-4 flex flex-wrap gap-1.5" role="group" aria-label={t('rates.quick.label')}>
        {picks.map((pick) => (
          <button
            key={pick.key}
            type="button"
            onClick={() => onChange(pick.value)}
            className={chipClass(value === pick.value)}
            aria-pressed={value === pick.value}
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
        {isFetching ? <span className="animate-fade-in">{t('rates.impact.loading')}</span> : null}
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
    <div className="animate-fade-in space-y-3" aria-live="polite">
      {/* Before → after */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-soft dark:border-gray-800 dark:bg-gray-900 dark:shadow-none">
        {previous !== null ? (
          <>
            <span className="text-sm tabular-nums text-gray-500 dark:text-gray-400">
              {formatCurrency(previous, currency)}
            </span>
            <ArrowRight className="h-4 w-4 text-purple-500 dark:text-purple-400" aria-hidden="true" />
          </>
        ) : null}
        <span className="text-lg font-semibold tabular-nums text-gray-900 dark:text-white">
          {hasRate ? formatCurrency(newRate as number, currency) : '—'}
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">{t('rates.perHour')}</span>
        </span>
        {percent !== null && Math.abs(percent) >= 0.05 ? (
          <Badge variant={percent > 0 ? 'green' : 'amber'} className="tabular-nums">
            {formatPercentChange(percent, lng)}
          </Badge>
        ) : null}
        <span className="w-full text-xs tabular-nums text-gray-500 dark:text-gray-400 sm:ml-auto sm:w-auto">
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
            'rounded-xl border px-4 py-3 transition-colors',
            applyToExisting
              ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-500/[0.06]'
              : 'border-amber-200 bg-amber-50/70 dark:border-amber-500/20 dark:bg-amber-500/[0.06]'
          )}
        >
          <p
            className={clsx(
              'text-sm font-medium',
              applyToExisting ? 'text-emerald-900 dark:text-emerald-200' : 'text-amber-900 dark:text-amber-200'
            )}
          >
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
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {t('rates.impact.deviating', { count: impact.logged.deviating })}
            </p>
          ) : null}
          {impact.logged.following > 0 ? (
            <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                className={clsx(checkboxClass, 'mt-px')}
                checked={!applyToExisting}
                onChange={(event) => onApplyToExistingChange(!event.target.checked)}
              />
              <span>{t('rates.impact.keepExisting')}</span>
            </label>
          ) : null}
          {impact.invoices_since > 0 ? (
            <p className="mt-2.5 flex items-start gap-2 text-xs font-medium text-red-700 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t('rates.impact.invoicesSince', {
                count: impact.invoices_since,
                date: formatYmd(validFrom, lng),
              })}
            </p>
          ) : null}
        </div>
      ) : !isFuture ? (
        <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
          {t('rates.impact.noLogged')}
        </p>
      ) : null}

      {isFuture ? (
        <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500 dark:text-sky-400" aria-hidden="true" />
          {previous !== null
            ? t('rates.impact.scheduled', {
                date: formatYmd(validFrom, lng),
                previous: formatCurrency(previous, currency),
              })
            : t('rates.impact.scheduledNoPrevious', { date: formatYmd(validFrom, lng) })}
        </p>
      ) : null}

      {impact.period_end ? (
        <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
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
