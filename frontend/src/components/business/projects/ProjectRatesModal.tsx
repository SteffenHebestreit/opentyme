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
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Alert } from '@/components/common/Alert';
import { Button } from '@/components/common/Button';
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
        <Button type="button" variant="outline" onClick={backToOverview} disabled={isSubmitting}>
          {t('rates.form.back')}
        </Button>
        {/* Distinct keys on purpose: the overview's "set new rate" button sits
            in the same slot. Reusing that DOM node would turn the button being
            clicked into a submit button mid-click, and the browser would submit
            the empty form straight away. */}
        <Button key="rate-form-submit" type="submit" form={FORM_ID} disabled={isSubmitting || !project}>
          {isSubmitting ? t('saving') : t('rates.form.save')}
        </Button>
      </>
    ) : (
      <>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('rates.close')}
        </Button>
        <Button key="rate-open-form" type="button" onClick={() => openForm(null)} disabled={!project}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          {t('rates.setNew')}
        </Button>
      </>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? t('rates.title', { name: project.name }) : t('rates.titleFallback')}
      size="lg"
      footer={footer}
    >
      {view.kind === 'form' ? (
        <form id={FORM_ID} className="space-y-5" onSubmit={handleSave} noValidate>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {editing
              ? t('rates.form.editTitle', { date: formatYmd(editing.valid_from, lng) })
              : t('rates.form.addTitle')}
          </h3>

          {error || formError ? (
            <Alert type="error" message={(formError ?? error) as string} onClose={() => { setFormError(null); onDismissError?.(); }} />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
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
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{t('rates.loading')}</p>
          ) : sorted.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center dark:border-gray-700 dark:bg-gray-900/40">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{t('rates.empty.title')}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">{t('rates.empty.message')}</p>
              <Button type="button" className="mt-4" onClick={() => openForm(null)}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('rates.setFirst')}
              </Button>
            </div>
          ) : (
            <>
              {/* What applies now, and what is already agreed for later */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 dark:border-purple-800/60 dark:bg-purple-900/20">
                  <p className="text-xs font-medium uppercase tracking-wide text-purple-700 dark:text-purple-300">
                    {t('rates.summary.current')}
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                    {current ? formatCurrency(current.hourly_rate, currency) : '—'}
                    <span className="text-sm font-normal text-gray-500 dark:text-gray-400">{t('rates.perHour')}</span>
                  </p>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                    {current
                      ? t('rates.summary.since', { date: formatYmd(current.valid_from, lng) })
                      : t('rates.summary.noneYet')}
                  </p>
                </div>

                <div
                  className={clsx(
                    'rounded-xl border p-4',
                    nextScheduled
                      ? 'border-blue-200 bg-blue-50 dark:border-blue-800/60 dark:bg-blue-900/20'
                      : 'border-dashed border-gray-300 dark:border-gray-700'
                  )}
                >
                  <p
                    className={clsx(
                      'flex items-center gap-1 text-xs font-medium uppercase tracking-wide',
                      nextScheduled ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'
                    )}
                  >
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('rates.summary.next')}
                  </p>
                  {nextScheduled ? (
                    <>
                      <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(nextScheduled.hourly_rate, currency)}
                        <span className="text-sm font-normal text-gray-500 dark:text-gray-400">{t('rates.perHour')}</span>
                        {(() => {
                          const percent = rateChangePercent(current?.hourly_rate ?? null, nextScheduled.hourly_rate);
                          return percent !== null && Math.abs(percent) >= 0.05 ? (
                            <span className="ml-2 align-middle text-sm font-medium text-blue-700 dark:text-blue-300">
                              {formatPercentChange(percent, lng)}
                            </span>
                          ) : null;
                        })()}
                      </p>
                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                        {t('rates.summary.from', { date: formatYmd(nextScheduled.valid_from, lng) })}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('rates.summary.noneScheduled')}</p>
                  )}
                </div>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">{t('rates.intro')}</p>

              {/* History */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">{t('rates.history')}</h3>
                <ol className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                  {timeline.map((rate) => {
                    const isFuture = rate.valid_from > today;
                    const isPast = !rate.is_current && !isFuture;
                    const previous = previousById.get(rate.id) ?? null;
                    const percent = rateChangePercent(previous, rate.hourly_rate);
                    const noteText = describeRateNote(rate.note, t);
                    const confirming = confirmingDeleteId === rate.id;

                    return (
                      <li key={rate.id} className={clsx('px-4 py-3', rate.is_current && 'bg-purple-50/60 dark:bg-purple-900/10')}>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <div className="min-w-[11rem]">
                            <p className={clsx('text-sm font-medium', isPast ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white')}>
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

                          <p className={clsx('text-sm font-semibold', isPast ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white')}>
                            {formatCurrency(rate.hourly_rate, currency)}
                            <span className="font-normal text-gray-500 dark:text-gray-400">{t('rates.perHour')}</span>
                          </p>

                          {percent !== null && Math.abs(percent) >= 0.05 ? (
                            <span className="text-xs text-gray-500 dark:text-gray-400">{formatPercentChange(percent, lng)}</span>
                          ) : null}

                          {rate.is_current ? (
                            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800 dark:bg-purple-900/40 dark:text-purple-200">
                              {t('rates.badge.current')}
                            </span>
                          ) : isFuture ? (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                              {t('rates.badge.scheduled')}
                            </span>
                          ) : null}

                          <div className="ml-auto flex items-center gap-1">
                            <button
                              type="button"
                              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                              onClick={() => openForm(rate)}
                              aria-label={t('rates.actions.edit', { date: formatYmd(rate.valid_from, lng) })}
                              title={t('edit')}
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
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
                          <div className="mt-2 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800/60 dark:bg-amber-900/20">
                            {(rate.deviating ?? []).map((group) => (
                              <div key={String(group.rate)} className="flex flex-wrap items-center gap-2">
                                <p className="flex-1 text-xs text-amber-900 dark:text-amber-100">
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
                                  variant="outline"
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
                          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/60 dark:bg-red-950/30">
                            <p className="flex-1 text-xs text-red-800 dark:text-red-200">
                              {previous !== null
                                ? t('rates.messages.deleteConfirmFallback', {
                                    date: formatYmd(rate.valid_from, lng),
                                    rate: formatCurrency(rate.hourly_rate, currency),
                                    previous: formatCurrency(previous, currency),
                                  })
                                : t('rates.messages.deleteConfirm', { date: formatYmd(rate.valid_from, lng) })}
                            </p>
                            <Button type="button" size="sm" variant="outline" onClick={() => setConfirmingDeleteId(null)}>
                              {t('cancel')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="danger"
                              onClick={() => void handleConfirmDelete(rate)}
                              disabled={deletingRateId === rate.id}
                            >
                              {deletingRateId === rate.id ? t('deleting') : t('delete')}
                            </Button>
                          </div>
                        ) : null}
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
