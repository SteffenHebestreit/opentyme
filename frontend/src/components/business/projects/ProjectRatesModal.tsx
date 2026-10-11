/**
 * @fileoverview A project's hourly rate as a timeline — what it is now, what is
 * already agreed for later, and how it got here.
 *
 * Two views in one modal:
 *
 * - **Overview**: the rate in force today, front and centre, with any scheduled
 *   change right beside it ("from 01.01.2027: 95,00 € (+11,8 %)"), then the
 *   history as a timeline — scheduled first, then current, then past.
 * - **Form**: set a new rate or correct one, with a start date that is always
 *   an explicit choice and a preview of what saving will do — including, for a
 *   contract extension signed after the date it takes effect, the entries
 *   already logged in the new period and an opt-in to move them onto it.
 *
 * Save / back live in the modal footer, which never scrolls away.
 *
 * Presentational: the parent owns the mutations and the error state.
 *
 * @module components/business/projects/ProjectRatesModal
 */

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CalendarClock, Coins, Info, Pencil, Plus, Trash2 } from 'lucide-react';
import { Alert } from '@/components/common/Alert';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import { SkeletonItem } from '@/components/common/Skeleton';
import { Input } from '@/components/forms';
import { Modal } from '@/components/ui/Modal';
import { Project } from '@/api/types';
import type {
  ProjectRatePayload,
  ProjectRatePeriod,
  ProjectRateUpdatePayload,
  RateImpact,
  SavedProjectRate,
} from '@/api/services/project-rate.service';
import { formatCurrency } from '@/utils/currency';
import { addDaysYmd, formatYmd, todayYmd } from '@/utils/date';
import { EffectiveDateField, RateImpactPanel } from './RateChange';
import { describeRateNote, formatPercentChange, rateChangePercent } from '@/utils/rates';
import { InlineConfirm } from './uiParts';
import { iconButtonClass } from './uiClasses';

interface ProjectRatesModalProps {
  open: boolean;
  project: Project | null;
  rates: ProjectRatePeriod[];
  isLoading: boolean;
  loadError?: string | null;
  /** Adds a period, or updates the one identified by rateId; resolves to the saved period, or null on failure. */
  onSubmit: (
    payload: ProjectRatePayload | ProjectRateUpdatePayload,
    rateId?: string
  ) => Promise<SavedProjectRate | null>;
  /** Removes a period; the modal has already asked for confirmation. Resolves true on success. */
  onDelete: (rate: ProjectRatePeriod) => Promise<boolean>;
  /**
   * Moves a period's entries onto its rate — only those at `fromRate`, so an
   * individually priced entry is not swept along. Resolves to the number moved.
   */
  onAlign: (rate: ProjectRatePeriod, fromRate: number | null) => Promise<number | null>;
  /** Id of the period whose entries are being aligned. */
  aligningRateId?: string | null;
  onClose: () => void;
  isSubmitting: boolean;
  deletingRateId?: string | null;
  error?: string | null;
  onDismissError?: () => void;
}

type View = { kind: 'overview' } | { kind: 'form'; editing: ProjectRatePeriod | null };

const FORM_ID = 'project-rate-form';

export const ProjectRatesModal: FC<ProjectRatesModalProps> = ({
  open,
  project,
  rates,
  isLoading,
  loadError,
  onSubmit,
  onDelete,
  onAlign,
  aligningRateId,
  onClose,
  isSubmitting,
  deletingRateId,
  error,
  onDismissError,
}) => {
  const { t, i18n } = useTranslation('projects');
  const lng = i18n.language;
  const currency = project?.currency || 'EUR';
  const today = todayYmd();

  const [view, setView] = useState<View>({ kind: 'overview' });
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // Form state
  const [rateInput, setRateInput] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [note, setNote] = useState('');
  const [applyToExisting, setApplyToExisting] = useState(true);
  const [impact, setImpact] = useState<RateImpact | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Reopening for another project starts fresh.
  useEffect(() => {
    if (open) {
      setView({ kind: 'overview' });
      setNotice(null);
      setConfirmingDeleteId(null);
    }
  }, [open, project?.id]);

  const sorted = useMemo(() => [...rates].sort((a, b) => a.valid_from.localeCompare(b.valid_from)), [rates]);
  const current = sorted.find((rate) => rate.is_current) ?? null;
  const nextScheduled = sorted.find((rate) => rate.valid_from > today) ?? null;

  /** Rate of the period immediately before each one, for the change badge. */
  const previousById = useMemo(() => {
    const map = new Map<string, number>();
    sorted.forEach((rate, index) => {
      if (index > 0) map.set(rate.id, sorted[index - 1].hourly_rate);
    });
    return map;
  }, [sorted]);

  // Scheduled first, then current, then the past newest-first: what is coming
  // and what applies now matter more than how it used to be.
  const timeline = useMemo(() => [...sorted].reverse(), [sorted]);

  const openForm = (editing: ProjectRatePeriod | null) => {
    setFormError(null);
    setNotice(null);
    setApplyToExisting(true);
    setImpact(null);
    if (editing) {
      setRateInput(String(editing.hourly_rate));
      setValidFrom(editing.valid_from);
      setNote(editing.note ?? '');
    } else {
      // No default start date: the day a new rate takes effect is always an
      // explicit choice (the quick picks make it one click).
      setRateInput('');
      setValidFrom('');
      setNote('');
    }
    onDismissError?.();
    setView({ kind: 'form', editing });
  };

  const backToOverview = () => {
    setFormError(null);
    onDismissError?.();
    setView({ kind: 'overview' });
  };

  const handleImpact = useCallback((next: RateImpact | null) => setImpact(next), []);

  const parsedRate = rateInput.trim() === '' ? null : Number(rateInput.replace(',', '.'));
  const editing = view.kind === 'form' ? view.editing : null;

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (parsedRate === null || Number.isNaN(parsedRate) || parsedRate < 0) {
      setFormError(t('rates.form.rate.required'));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) {
      setFormError(t('rates.form.validFrom.requiredOnChange'));
      return;
    }
    setFormError(null);

    const trimmedNote = note.trim();
    const payload = {
      hourly_rate: parsedRate,
      valid_from: validFrom,
      note: trimmedNote || undefined,
      apply_to_existing: applyToExisting,
    };

    // A period already starting that day is replaced, not a conflict: the user
    // said "from this day, this rate", and that is unambiguous.
    const targetId =
      editing?.id ??
      (impact?.existing_period && impact.valid_from === validFrom ? impact.existing_period.id : undefined);

    const saved = await onSubmit(payload, targetId);
    if (!saved) return;

    const rateText = formatCurrency(saved.hourly_rate, currency);
    const parts = [
      t('rates.messages.saved', { rate: rateText, date: formatYmd(saved.valid_from, lng) }),
    ];
    if (saved.repriced_entries) {
      parts.push(t('rates.messages.repriced', { count: saved.repriced_entries, rate: rateText }));
    }
    setNotice(parts.join(' '));
    setView({ kind: 'overview' });
  };

  const handleAlign = async (rate: ProjectRatePeriod, fromRate: number | null) => {
    const moved = await onAlign(rate, fromRate);
    if (moved !== null) {
      setNotice(
        t('rates.messages.aligned', {
          count: moved,
          rate: formatCurrency(rate.hourly_rate, currency),
        })
      );
    }
  };

  const handleConfirmDelete = async (rate: ProjectRatePeriod) => {
    const deleted = await onDelete(rate);
    setConfirmingDeleteId(null);
    if (deleted) {
      setNotice(t('rates.messages.deletedFrom', { date: formatYmd(rate.valid_from, lng) }));
    }
  };

  const footer =
    view.kind === 'form' ? (
      <>
        <Button type="button" variant="secondary" onClick={backToOverview} disabled={isSubmitting}>
          {t('rates.form.back')}
        </Button>
        {/* Distinct keys on purpose: the overview's "set new rate" button sits
            in the same slot. Reusing that DOM node would turn the button being
            clicked into a submit button mid-click, and the browser would submit
            the empty form straight away. */}
        <Button
          key="rate-form-submit"
          type="submit"
          form={FORM_ID}
          disabled={isSubmitting || !project}
          isLoading={isSubmitting}
        >
          {isSubmitting ? t('saving') : t('rates.form.save')}
        </Button>
      </>
    ) : (
      <>
        <Button type="button" variant="secondary" onClick={onClose}>
          {t('rates.close')}
        </Button>
        <Button
          key="rate-open-form"
          type="button"
          onClick={() => openForm(null)}
          disabled={!project}
          leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
        >
          {t('rates.setNew')}
        </Button>
      </>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? t('rates.title', { name: project.name }) : t('rates.titleFallback')}
      icon={<Coins className="h-4 w-4" aria-hidden="true" />}
      size="lg"
      footer={footer}
    >
      {view.kind === 'form' ? (
        <form id={FORM_ID} onSubmit={handleSave} noValidate>
          <h3 className="section-title mb-5">
            {editing
              ? t('rates.form.editTitle', { date: formatYmd(editing.valid_from, lng) })
              : t('rates.form.addTitle')}
          </h3>

          {error || formError ? (
            <div className="mb-5">
              <Alert type="error" message={(formError ?? error) as string} onClose={() => { setFormError(null); onDismissError?.(); }} />
            </div>
          ) : null}

          <div className="grid gap-x-4 sm:grid-cols-2">
            <Input
              id="project-rate-amount"
              label={t('rates.form.rate.label')}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder={current ? String(current.hourly_rate) : t('rates.form.rate.placeholder')}
              value={rateInput}
              onChange={(event) => setRateInput(event.target.value)}
              autoFocus
            />
            <EffectiveDateField
              id="project-rate-valid-from"
              label={t('rates.form.validFrom.labelRequired')}
              value={validFrom}
              onChange={(value) => {
                setValidFrom(value);
                setFormError(null);
              }}
            />
          </div>

          <Input
            id="project-rate-note"
            label={t('rates.form.note.label')}
            placeholder={t('rates.form.note.placeholder')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />

          <RateImpactPanel
            projectId={project?.id}
            currency={currency}
            newRate={parsedRate}
            validFrom={validFrom}
            editingPeriodId={editing?.id ?? null}
            applyToExisting={applyToExisting}
            onApplyToExistingChange={setApplyToExisting}
            onImpact={handleImpact}
          />
        </form>
      ) : (
        <div className="space-y-5">
          {notice ? <Alert type="success" message={notice} onClose={() => setNotice(null)} /> : null}
          {error ? <Alert type="error" message={error} onClose={onDismissError} /> : null}
          {loadError ? <Alert type="error" message={loadError} /> : null}

          {isLoading ? (
            <div className="space-y-5" role="status" aria-label={t('rates.loading')}>
              <div className="grid gap-3 sm:grid-cols-2">
                {[0, 1].map((index) => (
                  <div key={index} className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <SkeletonItem className="h-3 w-24" />
                    <SkeletonItem className="h-7 w-32" />
                    <SkeletonItem className="h-3 w-20" />
                  </div>
                ))}
              </div>
              <div className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <SkeletonItem className="h-4 w-1/2" />
                <SkeletonItem className="h-4 w-2/3" />
                <SkeletonItem className="h-4 w-1/3" />
              </div>
            </div>
          ) : sorted.length === 0 ? (
            <EmptyState
              bordered
              icon={Coins}
              title={t('rates.empty.title')}
              description={t('rates.empty.message')}
              action={
                <Button
                  type="button"
                  onClick={() => openForm(null)}
                  leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                >
                  {t('rates.setFirst')}
                </Button>
              }
            />
          ) : (
            <>
              {/* What applies now, and what is already agreed for later */}
              <div className="stagger grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-purple-200/80 bg-purple-50/50 p-4 dark:border-purple-500/20 dark:bg-purple-500/[0.06]">
                  <p className="eyebrow !text-purple-700 dark:!text-purple-300">
                    {t('rates.summary.current')}
                  </p>
                  <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white">
                    {current ? formatCurrency(current.hourly_rate, currency) : '—'}
                    <span className="text-sm font-normal text-gray-500 dark:text-gray-400">{t('rates.perHour')}</span>
                  </p>
                  <p className="mt-1 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    {current
                      ? t('rates.summary.since', { date: formatYmd(current.valid_from, lng) })
                      : t('rates.summary.noneYet')}
                  </p>
                </div>

                <div
                  className={clsx(
                    'rounded-xl border p-4',
                    nextScheduled
                      ? 'border-sky-200/80 bg-sky-50/50 dark:border-sky-500/20 dark:bg-sky-500/[0.06]'
                      : 'border-dashed border-gray-300 dark:border-gray-700'
                  )}
                >
                  <p
                    className={clsx(
                      'eyebrow flex items-center gap-1.5',
                      nextScheduled && '!text-sky-700 dark:!text-sky-300'
                    )}
                  >
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('rates.summary.next')}
                  </p>
                  {nextScheduled ? (
                    <>
                      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white">
                        {formatCurrency(nextScheduled.hourly_rate, currency)}
                        <span className="text-sm font-normal text-gray-500 dark:text-gray-400">{t('rates.perHour')}</span>
                        {(() => {
                          const percent = rateChangePercent(current?.hourly_rate ?? null, nextScheduled.hourly_rate);
                          return percent !== null && Math.abs(percent) >= 0.05 ? (
                            <Badge variant="blue" className="ml-2 align-middle tabular-nums tracking-normal">
                              {formatPercentChange(percent, lng)}
                            </Badge>
                          ) : null;
                        })()}
                      </p>
                      <p className="mt-1 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                        {t('rates.summary.from', { date: formatYmd(nextScheduled.valid_from, lng) })}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('rates.summary.noneScheduled')}</p>
                  )}
                </div>
              </div>

              <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                {t('rates.intro')}
              </p>

              {/* History as a timeline: scheduled on top, then current, then the past */}
              <div>
                <h3 className="section-title mb-3">{t('rates.history')}</h3>
                <ol className="rounded-xl border border-gray-200 bg-white px-4 py-2 shadow-soft dark:border-gray-800 dark:bg-gray-900 dark:shadow-none">
                  {timeline.map((rate, index) => {
                    const isFuture = rate.valid_from > today;
                    const isPast = !rate.is_current && !isFuture;
                    const previous = previousById.get(rate.id) ?? null;
                    const percent = rateChangePercent(previous, rate.hourly_rate);
                    const noteText = describeRateNote(rate.note, t);
                    const confirming = confirmingDeleteId === rate.id;
                    const isLast = index === timeline.length - 1;

                    return (
                      <li key={rate.id} className="relative py-2 pl-7">
                        {/* Rail and dot */}
                        {!isLast ? (
                          <span
                            className="absolute bottom-0 left-[7px] top-[2.3rem] w-px bg-gray-200 dark:bg-gray-800"
                            aria-hidden="true"
                          />
                        ) : null}
                        {index > 0 ? (
                          <span
                            className="absolute left-[7px] top-0 h-[1.625rem] w-px bg-gray-200 dark:bg-gray-800"
                            aria-hidden="true"
                          />
                        ) : null}
                        <span
                          className={clsx(
                            'absolute left-0.5 top-[1.625rem] h-[11px] w-[11px] rounded-full ring-4 ring-white dark:ring-gray-900',
                            rate.is_current
                              ? 'bg-purple-500 dark:bg-purple-400'
                              : isFuture
                                ? 'bg-sky-500 dark:bg-sky-400'
                                : 'bg-gray-300 dark:bg-gray-600'
                          )}
                          aria-hidden="true"
                        />

                        <div
                          className={clsx(
                            'rounded-lg px-3 py-2 transition-colors',
                            rate.is_current ? 'bg-purple-50/70 dark:bg-purple-500/[0.07]' : 'hover:bg-gray-50 dark:hover:bg-white/[0.02]'
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <div className="min-w-[11rem]">
                              <p className={clsx('text-sm font-medium tabular-nums', isPast ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white')}>
                                {rate.valid_until
                                  ? t('rates.period.range', {
                                      from: formatYmd(rate.valid_from, lng),
                                      until: formatYmd(addDaysYmd(rate.valid_until, -1), lng),
                                    })
                                  : t('rates.period.open', { from: formatYmd(rate.valid_from, lng) })}
                              </p>
                              {noteText ? (
                                <p className="text-xs text-gray-500 dark:text-gray-400">{noteText}</p>
                              ) : null}
                            </div>

                            <p className={clsx('text-sm font-semibold tabular-nums', isPast ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white')}>
                              {formatCurrency(rate.hourly_rate, currency)}
                              <span className="font-normal text-gray-500 dark:text-gray-400">{t('rates.perHour')}</span>
                            </p>

                            {percent !== null && Math.abs(percent) >= 0.05 ? (
                              <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{formatPercentChange(percent, lng)}</span>
                            ) : null}

                            {rate.is_current ? (
                              <Badge variant="purple" size="sm">
                                {t('rates.badge.current')}
                              </Badge>
                            ) : isFuture ? (
                              <Badge variant="blue" size="sm">
                                {t('rates.badge.scheduled')}
                              </Badge>
                            ) : null}

                            <div className="ml-auto flex items-center gap-0.5">
                              <button
                                type="button"
                                className={iconButtonClass()}
                                onClick={() => openForm(rate)}
                                aria-label={t('rates.actions.edit', { date: formatYmd(rate.valid_from, lng) })}
                                title={t('edit')}
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className={iconButtonClass('danger')}
                                onClick={() => setConfirmingDeleteId(rate.id)}
                                disabled={deletingRateId === rate.id}
                                aria-label={t('rates.actions.delete', { date: formatYmd(rate.valid_from, lng) })}
                                title={t('delete')}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                          </div>

                          {/* Entries in this period at a different rate — visible, and
                              fixable in one click instead of entry by entry. */}
                          {(rate.deviating ?? []).length > 0 ? (
                            <div className="mt-2 space-y-1.5 rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2 dark:border-amber-500/20 dark:bg-amber-500/[0.06]">
                              {(rate.deviating ?? []).map((group) => (
                                <div key={String(group.rate)} className="flex flex-wrap items-center gap-2">
                                  <p className="flex-1 text-xs text-amber-900 dark:text-amber-200">
                                    {group.rate === null
                                      ? t('rates.deviation.noRate', { count: group.count })
                                      : t('rates.deviation.atRate', {
                                          count: group.count,
                                          rate: formatCurrency(group.rate, currency),
                                        })}
                                  </p>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    disabled={aligningRateId === rate.id}
                                    onClick={() => void handleAlign(rate, group.rate)}
                                  >
                                    {aligningRateId === rate.id
                                      ? t('saving')
                                      : t('rates.deviation.align', { rate: formatCurrency(rate.hourly_rate, currency) })}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {confirming ? (
                            <InlineConfirm
                              className="mt-3"
                              message={
                                previous !== null
                                  ? t('rates.messages.deleteConfirmFallback', {
                                      date: formatYmd(rate.valid_from, lng),
                                      rate: formatCurrency(rate.hourly_rate, currency),
                                      previous: formatCurrency(previous, currency),
                                    })
                                  : t('rates.messages.deleteConfirm', { date: formatYmd(rate.valid_from, lng) })
                              }
                              cancelLabel={t('cancel')}
                              confirmLabel={deletingRateId === rate.id ? t('deleting') : t('delete')}
                              busy={deletingRateId === rate.id}
                              onCancel={() => setConfirmingDeleteId(null)}
                              onConfirm={() => void handleConfirmDelete(rate)}
                            />
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
};
