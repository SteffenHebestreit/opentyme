/**
 * @fileoverview Create/edit modal for recurring invoice (retainer) schedules.
 *
 * Captures the schedule cadence, billing target, and line items used to generate
 * draft invoices automatically. Generated invoices are always drafts.
 *
 * @module components/business/invoices/RecurringInvoiceFormModal
 */

import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../ui/Modal';
import { Button } from '../../common/Button';
import { Alert } from '../../common/Alert';
import { Input } from '../../forms/Input';
import { Select } from '../../forms/Select';
import { Textarea } from '../../forms/Textarea';
import { fieldClasses } from '../../forms/fieldStyles';
import { Trash2, Plus, Repeat } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Client, Project, TaxRate } from '../../../api/types';
import {
  RecurringInvoice,
  RecurringInvoicePayload,
  RecurringInvoiceLineItem,
} from '../../../api/services/recurring-invoice.service';

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: RecurringInvoice | null;
  clients: Client[];
  projects: Project[];
  taxRates: TaxRate[];
  onSave: (payload: RecurringInvoicePayload) => Promise<void>;
  onClose: () => void;
  isSaving: boolean;
  error?: string | null;
}

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY'];
const emptyItem = (): RecurringInvoiceLineItem => ({ description: '', quantity: 1, unit_price: 0, rate_type: 'hourly' });

const todayStr = () => new Date().toISOString().split('T')[0];

/** Field row; Input/Select bottom margins are dropped so rows line up. */
const fieldRow = 'grid gap-4 [&>div]:mb-0';

/** Line-item columns: description, quantity, unit price, remove (description gets its own row on phones). */
const itemGrid =
  'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.25rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_7.5rem_2.25rem]';

export const RecurringInvoiceFormModal: FC<Props> = ({
  open,
  mode,
  initial,
  clients,
  projects,
  taxRates,
  onSave,
  onClose,
  isSaving,
  error,
}) => {
  const { t } = useTranslation(['invoices', 'common']);
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [frequency, setFrequency] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [taxRateId, setTaxRateId] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState('30');
  const [headline, setHeadline] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [items, setItems] = useState<RecurringInvoiceLineItem[]>([emptyItem()]);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    if (initial) {
      setTitle(initial.title);
      setClientId(initial.client_id);
      setProjectId(initial.project_id || '');
      setFrequency(initial.frequency);
      setStartDate(initial.start_date);
      setEndDate(initial.end_date || '');
      setCurrency(initial.currency || 'EUR');
      setTaxRateId(initial.tax_rate_id || '');
      setPaymentTermsDays(String(initial.payment_terms_days ?? 30));
      setHeadline(initial.invoice_headline || '');
      setNotes(initial.notes || '');
      setIsActive(initial.is_active);
      setItems(initial.line_items?.length ? initial.line_items.map((i) => ({ ...i })) : [emptyItem()]);
    } else {
      setTitle('');
      setClientId('');
      setProjectId('');
      setFrequency('monthly');
      setStartDate(todayStr());
      setEndDate('');
      setCurrency('EUR');
      setTaxRateId('');
      setPaymentTermsDays('30');
      setHeadline('');
      setNotes('');
      setIsActive(true);
      setItems([emptyItem()]);
    }
  }, [open, initial]);

  // Projects relevant to the selected client (or all when none chosen)
  const clientProjects = useMemo(
    () => projects.filter((p) => !clientId || p.client_id === clientId),
    [projects, clientId]
  );

  const total = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0),
    [items]
  );

  const updateItem = (idx: number, patch: Partial<RecurringInvoiceLineItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!title.trim()) return setLocalError(t('recurring.form.errors.titleRequired'));
    if (!clientId) return setLocalError(t('recurring.form.errors.clientRequired'));
    if (!startDate) return setLocalError(t('recurring.form.errors.startRequired'));
    if (endDate && endDate <= startDate) return setLocalError(t('recurring.form.errors.endAfterStart'));

    const cleanItems = items
      .map((it) => ({
        description: it.description.trim(),
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        rate_type: it.rate_type,
      }))
      .filter((it) => it.description && Number.isFinite(it.quantity) && Number.isFinite(it.unit_price));

    if (cleanItems.length === 0) return setLocalError(t('recurring.form.errors.itemsRequired'));

    const payload: RecurringInvoicePayload = {
      client_id: clientId,
      project_id: projectId || null,
      title: title.trim(),
      frequency,
      start_date: startDate,
      end_date: endDate || null,
      is_active: isActive,
      currency,
      tax_rate_id: taxRateId || null,
      payment_terms_days: Number(paymentTermsDays) || 30,
      invoice_headline: headline.trim() || null,
      notes: notes.trim() || null,
      line_items: cleanItems,
    };

    await onSave(payload);
  };

  const formId = 'recurring-invoice-form';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? t('recurring.form.titleCreate') : t('recurring.form.titleEdit')}
      icon={<Repeat className="h-4 w-4" />}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t('common:buttons.cancel')}</Button>
          <Button type="submit" form={formId} isLoading={isSaving}>
            {isSaving ? t('saving') : mode === 'create' ? t('recurring.form.submitCreate') : t('recurring.form.submitEdit')}
          </Button>
        </>
      }
    >
      <form id={formId} className="space-y-5" onSubmit={handleSubmit}>
        {(error || localError) && <Alert type="error" message={error || localError || ''} />}

        <Input
          label={t('recurring.form.fields.title')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('recurring.form.fields.titlePlaceholder')}
        />

        <div className={cn(fieldRow, 'sm:grid-cols-2')}>
          <Select label={t('recurring.form.fields.client')} value={clientId} onChange={(e) => { setClientId(e.target.value); setProjectId(''); }}>
            <option value="">{t('recurring.form.fields.selectClient')}</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label={t('recurring.form.fields.project')} value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!clientId}>
            <option value="">{t('recurring.form.fields.noProject')}</option>
            {clientProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>

        <div className={cn(fieldRow, 'sm:grid-cols-3')}>
          <Select label={t('recurring.form.fields.frequency')} value={frequency} onChange={(e) => setFrequency(e.target.value as any)}>
            <option value="monthly">{t('recurring.frequency.monthly')}</option>
            <option value="quarterly">{t('recurring.frequency.quarterly')}</option>
            <option value="yearly">{t('recurring.frequency.yearly')}</option>
          </Select>
          <Input label={t('recurring.form.fields.startDate')} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label={t('recurring.form.fields.endDate')} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        <div className={cn(fieldRow, 'sm:grid-cols-3')}>
          <Select label={t('recurring.form.fields.currency')} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select label={t('recurring.form.fields.taxRate')} value={taxRateId} onChange={(e) => setTaxRateId(e.target.value)}>
            <option value="">{t('recurring.form.fields.noTax')}</option>
            {taxRates.map((tr) => <option key={tr.id} value={tr.id}>{tr.name} ({tr.rate}%)</option>)}
          </Select>
          <Input label={t('recurring.form.fields.paymentTerms')} type="number" min="0" value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(e.target.value)} />
        </div>

        <Input
          label={t('recurring.form.fields.headline')}
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder={t('recurring.form.fields.headlinePlaceholder')}
        />

        {/* Line items */}
        <section className="space-y-3 border-t border-gray-100 pt-5 dark:border-gray-800">
          <div className="flex items-center justify-between gap-3">
            <h3 className="eyebrow">{t('recurring.form.fields.lineItems')}</h3>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setItems((p) => [...p, emptyItem()])}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              {t('recurring.form.fields.addItem')}
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
            <div
              className={cn(itemGrid, 'hidden border-b border-gray-100 bg-gray-50/80 px-3 py-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-400 sm:grid')}
              aria-hidden="true"
            >
              <div>{t('recurring.form.fields.description')}</div>
              <div className="text-right">{t('recurring.form.fields.quantity')}</div>
              <div className="text-right">{t('recurring.form.fields.unitPrice')}</div>
              <div />
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800/70">
              {items.map((it, idx) => (
                <li key={idx} className={cn(itemGrid, 'animate-fade-in px-3 py-2.5')}>
                  <input
                    className={cn(fieldClasses(), 'col-span-3 sm:col-span-1')}
                    placeholder={t('recurring.form.fields.description')}
                    aria-label={t('recurring.form.fields.description')}
                    value={it.description}
                    onChange={(e) => updateItem(idx, { description: e.target.value })}
                  />
                  <input
                    className={cn(fieldClasses(), 'text-right tabular-nums')}
                    type="number" step="0.01" min="0"
                    placeholder={t('recurring.form.fields.quantity')}
                    aria-label={t('recurring.form.fields.quantity')}
                    value={it.quantity}
                    onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                  />
                  <input
                    className={cn(fieldClasses(), 'text-right tabular-nums')}
                    type="number" step="0.01"
                    placeholder={t('recurring.form.fields.unitPrice')}
                    aria-label={t('recurring.form.fields.unitPrice')}
                    value={it.unit_price}
                    onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
                  />
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:pointer-events-none disabled:opacity-30 dark:text-gray-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                    onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                    disabled={items.length === 1}
                    aria-label={t('recurring.form.fields.removeItem')}
                    title={t('recurring.form.fields.removeItem')}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-end gap-3 border-t border-gray-100 bg-gray-50/80 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.02]">
              <span className="text-sm text-gray-500 dark:text-gray-400">{t('recurring.form.fields.subtotal')}</span>
              <span className="text-base font-semibold tabular-nums text-gray-900 dark:text-white">{total.toFixed(2)} {currency}</span>
            </div>
          </div>
        </section>

        <Textarea label={t('recurring.form.fields.notes')} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />

        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          {t('recurring.form.fields.active')}
        </label>
      </form>
    </Modal>
  );
};

export default RecurringInvoiceFormModal;
