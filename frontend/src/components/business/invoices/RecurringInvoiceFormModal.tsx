/**
 * @fileoverview Create/edit modal for recurring invoice (retainer) schedules.
 *
 * Captures the schedule cadence, billing target, and line items used to generate
 * draft invoices automatically. Generated invoices are always drafts.
 *
 * @module components/business/invoices/RecurringInvoiceFormModal
 */

import { FC, useEffect, useMemo, useState } from 'react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../common/Button';
import { Alert } from '../../common/Alert';
import { Input } from '../../forms/Input';
import { Select } from '../../forms/Select';
import { Textarea } from '../../forms/Textarea';
import { Trash2, Plus } from 'lucide-react';
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

    if (!title.trim()) return setLocalError('A title is required.');
    if (!clientId) return setLocalError('Please select a client.');
    if (!startDate) return setLocalError('A start date is required.');
    if (endDate && endDate <= startDate) return setLocalError('End date must be after the start date.');

    const cleanItems = items
      .map((it) => ({
        description: it.description.trim(),
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        rate_type: it.rate_type,
      }))
      .filter((it) => it.description && Number.isFinite(it.quantity) && Number.isFinite(it.unit_price));

    if (cleanItems.length === 0) return setLocalError('Add at least one line item with a description.');

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
      title={mode === 'create' ? 'New recurring invoice' : 'Edit recurring invoice'}
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} disabled={isSaving}>
            {isSaving ? 'Saving…' : mode === 'create' ? 'Create schedule' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form id={formId} className="space-y-5" onSubmit={handleSubmit}>
        {(error || localError) && <Alert type="error" message={error || localError || ''} />}

        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Monthly retainer – Acme" />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Client" value={clientId} onChange={(e) => { setClientId(e.target.value); setProjectId(''); }}>
            <option value="">Select a client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Project (optional)" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!clientId}>
            <option value="">No project</option>
            {clientProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as any)}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </Select>
          <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="End date (optional)" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select label="Tax rate (optional)" value={taxRateId} onChange={(e) => setTaxRateId(e.target.value)}>
            <option value="">No tax</option>
            {taxRates.map((tr) => <option key={tr.id} value={tr.id}>{tr.name} ({tr.rate}%)</option>)}
          </Select>
          <Input label="Payment terms (days)" type="number" min="0" value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(e.target.value)} />
        </div>

        <Input label="Invoice headline (optional)" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Shown as the invoice title" />

        {/* Line items */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Line items</span>
            <button type="button" onClick={() => setItems((p) => [...p, emptyItem()])} className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400">
              <Plus className="h-4 w-4" /> Add item
            </button>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <input
                  className="col-span-6 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  placeholder="Description"
                  value={it.description}
                  onChange={(e) => updateItem(idx, { description: e.target.value })}
                />
                <input
                  className="col-span-2 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  type="number" step="0.01" min="0" placeholder="Qty"
                  value={it.quantity}
                  onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                />
                <input
                  className="col-span-3 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  type="number" step="0.01" placeholder="Unit price"
                  value={it.unit_price}
                  onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
                />
                <button
                  type="button"
                  className="col-span-1 flex items-center justify-center text-gray-400 hover:text-red-500 disabled:opacity-30"
                  onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                  disabled={items.length === 1}
                  aria-label="Remove line item"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 text-right text-sm font-medium text-gray-700 dark:text-gray-300">
            Subtotal per invoice: {total.toFixed(2)} {currency}
          </div>
        </div>

        <Textarea label="Notes (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />

        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          <input type="checkbox" className="h-4 w-4 rounded text-purple-600 focus:ring-purple-500" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active (generate invoices automatically)
        </label>
      </form>
    </Modal>
  );
};

export default RecurringInvoiceFormModal;
