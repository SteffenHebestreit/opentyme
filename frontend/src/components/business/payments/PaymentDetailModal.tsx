import { Modal } from '@/components/ui/Modal';
import { Invoice, Payment, PaymentPayload } from '@/api/types';
import { formatCurrency } from '@/utils/currency';
import { formatDate, toYmd, todayYmd } from '@/utils/date';
import { useTranslation } from 'react-i18next';
import { FormEvent, ReactNode, useState, useEffect, useMemo } from 'react';
import { useDeletePayment, useUpdatePayment } from '@/hooks/api/usePayments';
import { useInvoices } from '@/hooks/api/useInvoices';
import { ArrowDownLeft, ArrowUpRight, Check, ExternalLink, Landmark, Pencil, Trash2, Wallet } from 'lucide-react';
import { Badge, BadgeVariant } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Alert } from '@/components/common/Alert';
import { Input, CustomSelect, Textarea } from '@/components/forms';
import { InvoiceStatusBadge } from '@/components/business/invoices/InvoiceStatusBadge';
import { confirmDialog } from '@/lib/confirm';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/cn';

interface PaymentDetailModalProps {
  payment: Payment | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToInvoice?: (invoiceId: string) => void;
}

const formId = 'edit-payment-form';

/** Two-column field row; Input's own bottom margin is dropped so rows line up. */
const fieldRow = 'grid gap-4 sm:grid-cols-2 [&>div]:mb-0';

/** Statuses an invoice can take a payment in. */
const OPEN_STATUSES = ['sent', 'partially_paid', 'overdue'];

/** Label + value in the payment details grid. */
function DetailItem({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-white">{children}</dd>
    </div>
  );
}

/** The payment's date as `YYYY-MM-DD` for a date input (the API sends a timestamp). */
function paymentDateYmd(value: string): string {
  if (!value) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toYmd(new Date(value));
}

/** Ids of the invoices a payment is linked to (junction rows, or the legacy invoice_id). */
function linkedInvoiceIds(payment: Payment): string[] {
  if (payment.linked_invoices && payment.linked_invoices.length > 0) {
    return payment.linked_invoices.map((linked) => linked.invoice_id);
  }
  return payment.invoice_id ? [payment.invoice_id] : [];
}

/** The backend's error message from a failed request, if it sent one. */
const apiMessage = (err: unknown): string | undefined =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message;

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, index) => id === b[index]);

export function PaymentDetailModal({ payment, isOpen, onClose, onNavigateToInvoice }: PaymentDetailModalProps) {
  const { t } = useTranslation('payments');
  const { t: tInvoices } = useTranslation('invoices');
  const { t: tCommon } = useTranslation('common');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit form state
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [notes, setNotes] = useState('');
  const [excludeFromTax, setExcludeFromTax] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);

  const updatePaymentMutation = useUpdatePayment();
  const deletePaymentMutation = useDeletePayment();
  const { data: allInvoices = [] } = useInvoices();

  const canLinkInvoices = !!payment?.client_id && (payment.payment_type === 'payment' || payment.payment_type === 'refund');
  const originalInvoiceIds = useMemo(() => (payment ? linkedInvoiceIds(payment) : []), [payment]);

  const resetForm = () => {
    if (!payment) return;
    setAmount(String(Number(payment.amount)));
    setPaymentDate(paymentDateYmd(payment.payment_date));
    setPaymentMethod(payment.payment_method || 'bank_transfer');
    setTransactionId(payment.transaction_id || '');
    setNotes(payment.notes || '');
    setExcludeFromTax(payment.exclude_from_tax || false);
    setSelectedInvoiceIds(linkedInvoiceIds(payment));
    setError(null);
  };

  // Start in view mode whenever another payment is opened
  useEffect(() => {
    if (payment && isOpen) {
      setIsEditing(false);
      resetForm();
    }
  }, [payment?.id, isOpen]);

  // The client's invoices that can take this payment: the open ones plus whatever it is linked to now
  const selectableInvoices = useMemo(() => {
    if (!payment?.client_id || !Array.isArray(allInvoices)) return [];
    return allInvoices
      .filter((inv: Invoice) =>
        inv.client_id === payment.client_id &&
        (OPEN_STATUSES.includes(inv.status) || originalInvoiceIds.includes(inv.id))
      )
      .sort((a: Invoice, b: Invoice) => String(b.issue_date).localeCompare(String(a.issue_date)));
  }, [allInvoices, payment?.client_id, originalInvoiceIds]);

  const selectedTotal = useMemo(
    () => selectableInvoices
      .filter((inv: Invoice) => selectedInvoiceIds.includes(inv.id))
      .reduce((sum: number, inv: Invoice) => sum + Number(inv.total_amount), 0),
    [selectableInvoices, selectedInvoiceIds]
  );

  if (!payment) return null;

  const isBusy = updatePaymentMutation.isPending || deletePaymentMutation.isPending;
  const parsedAmount = parseFloat(amount);

  const toggleInvoice = (invoiceId: string) => {
    setSelectedInvoiceIds((prev) =>
      prev.includes(invoiceId) ? prev.filter((id) => id !== invoiceId) : [...prev, invoiceId]
    );
  };

  const handleSave = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError(tInvoices('recordPayment.errors.invalidAmount'));
      return;
    }
    if (!paymentDate) {
      setError(t('editForm.dateRequired'));
      return;
    }
    if (canLinkInvoices && selectedInvoiceIds.length === 0 && (payment.payment_type === 'refund' || !payment.project_id)) {
      setError(t('editForm.invoiceRequired'));
      return;
    }

    // Send only what changed, so an untouched date is never re-sent through a timezone
    const payload: Partial<PaymentPayload> = {};
    if (Math.round(parsedAmount * 100) !== Math.round(Number(payment.amount) * 100)) payload.amount = parsedAmount;
    if (paymentDate !== paymentDateYmd(payment.payment_date)) payload.payment_date = paymentDate;
    if (paymentMethod !== (payment.payment_method || 'bank_transfer')) payload.payment_method = paymentMethod;
    if (transactionId !== (payment.transaction_id || '')) payload.transaction_id = transactionId || null;
    if (notes !== (payment.notes || '')) payload.notes = notes || null;
    if (excludeFromTax !== (payment.exclude_from_tax || false)) payload.exclude_from_tax = excludeFromTax;
    if (canLinkInvoices && !sameIds(selectedInvoiceIds, originalInvoiceIds)) payload.invoice_ids = selectedInvoiceIds;

    if (Object.keys(payload).length === 0) {
      setIsEditing(false);
      return;
    }

    try {
      await updatePaymentMutation.mutateAsync({ id: payment.id, payload });
      toast.success(t('messages.updateSuccess'));
      onClose();
    } catch (err) {
      console.error('Failed to update payment:', err);
      setError(apiMessage(err) || t('messages.updateFailed'));
    }
  };

  const handleCancel = () => {
    resetForm();
    setIsEditing(false);
  };

  const handleDelete = async () => {
    const confirmed = await confirmDialog({
      title: t('delete'),
      message: t('messages.deleteConfirmDetail', {
        amount: formatCurrency(payment.amount),
        date: formatDate(payment.payment_date),
      }),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deletePaymentMutation.mutateAsync(payment.id);
      toast.success(t('messages.deleteSuccess'));
      onClose();
    } catch (err) {
      console.error('Failed to delete payment:', err);
      toast.error(apiMessage(err) || t('messages.deleteFailed'));
    }
  };

  const getPaymentTypeInfo = (type: string): { label: string; icon: ReactNode; variant: BadgeVariant; amountClass: string } => {
    switch (type) {
      case 'payment':
        return {
          label: t('type.paymentIncome'),
          icon: <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" />,
          variant: 'green',
          amountClass: 'text-emerald-600 dark:text-emerald-400',
        };
      case 'refund':
        return {
          label: t('type.refundOutgoing'),
          icon: <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />,
          variant: 'red',
          amountClass: 'text-red-600 dark:text-red-400',
        };
      case 'expense':
        return {
          label: t('type.expense', { defaultValue: 'Expense' }),
          icon: <Wallet className="h-3.5 w-3.5" aria-hidden="true" />,
          variant: 'blue',
          amountClass: 'text-gray-900 dark:text-white',
        };
      case 'vat_refund':
      case 'income_tax_refund':
        return {
          label: t(`type.${type}`, { defaultValue: type }),
          icon: <Landmark className="h-3.5 w-3.5" aria-hidden="true" />,
          variant: type === 'vat_refund' ? 'emerald' : 'teal',
          amountClass: 'text-emerald-600 dark:text-emerald-400',
        };
      default:
        return {
          label: type,
          icon: null,
          variant: 'gray',
          amountClass: 'text-gray-900 dark:text-white',
        };
    }
  };

  const typeInfo = getPaymentTypeInfo(payment.payment_type);

  const invoiceLinkClass =
    'inline-flex items-center gap-1.5 rounded font-medium text-brand-600 transition-colors hover:text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400 dark:hover:text-brand-300';

  const paymentMethods = [
    { value: 'bank_transfer', label: tInvoices('recordPayment.methods.bankTransfer') },
    { value: 'cash', label: tInvoices('recordPayment.methods.cash') },
    { value: 'check', label: tInvoices('recordPayment.methods.check') },
    { value: 'credit_card', label: tInvoices('recordPayment.methods.creditCard') },
    { value: 'paypal', label: tInvoices('recordPayment.methods.paypal') },
    { value: 'other', label: tInvoices('recordPayment.methods.other') },
  ];
  // Keep a method stored by an older version selectable
  if (payment.payment_method && !paymentMethods.some((m) => m.value === payment.payment_method)) {
    paymentMethods.push({ value: payment.payment_method, label: payment.payment_method.replace(/_/g, ' ') });
  }

  const amountDiffers =
    canLinkInvoices && payment.payment_type === 'payment' && selectedInvoiceIds.length > 0 && !Number.isNaN(parsedAmount)
      ? Math.round(parsedAmount * 100) - Math.round(selectedTotal * 100)
      : 0;

  const viewFooter = (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={handleDelete}
        isLoading={deletePaymentMutation.isPending}
        disabled={isBusy}
        leftIcon={<Trash2 className="h-4 w-4" />}
        className="text-red-600 hover:text-red-700 sm:mr-auto dark:text-red-400 dark:hover:text-red-300"
      >
        {tCommon('buttons.delete')}
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          resetForm();
          setIsEditing(true);
        }}
        disabled={isBusy}
        leftIcon={<Pencil className="h-4 w-4" />}
      >
        {tCommon('buttons.edit')}
      </Button>
    </>
  );

  const editFooter = (
    <>
      <Button type="button" variant="secondary" onClick={handleCancel} disabled={isBusy}>
        {t('messages.cancel')}
      </Button>
      <Button type="submit" form={formId} isLoading={updatePaymentMutation.isPending}>
        {updatePaymentMutation.isPending ? t('messages.saving') : t('messages.saveChanges')}
      </Button>
    </>
  );

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={isEditing ? t('edit') : t('view')}
      size="md"
      footer={isEditing ? editFooter : viewFooter}
    >
      {isEditing ? (
        <form id={formId} onSubmit={handleSave} className="space-y-5">
          {canLinkInvoices && (
            <div>
              <p className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('fields.linkedInvoices')}
              </p>
              {selectableInvoices.length > 0 ? (
                <div className="max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200 dark:divide-gray-800/70 dark:border-gray-800">
                  {selectableInvoices.map((inv: Invoice) => {
                    const selected = selectedInvoiceIds.includes(inv.id);
                    return (
                      <button
                        key={inv.id}
                        type="button"
                        onClick={() => toggleInvoice(inv.id)}
                        aria-pressed={selected}
                        className={cn(
                          'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-white/[0.04]',
                          selected ? 'bg-brand-50/70 dark:bg-brand-500/10' : 'hover:bg-gray-50 dark:hover:bg-white/[0.02]'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                            selected
                              ? 'border-brand-600 bg-brand-600 text-white dark:border-brand-400 dark:bg-brand-400 dark:text-gray-950'
                              : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900'
                          )}
                          aria-hidden="true"
                        >
                          {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="truncate text-sm font-medium text-gray-900 dark:text-white">{inv.invoice_number}</span>
                          <InvoiceStatusBadge status={inv.status} size="sm" />
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-gray-700 dark:text-gray-300">
                          {formatCurrency(Number(inv.total_amount))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
                  {tInvoices('recordPayment.noUnpaidInvoices')}
                </p>
              )}
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('editForm.statusHint')}</p>
            </div>
          )}

          {error && <Alert type="error" message={error} />}

          <div className={fieldRow}>
            <Input
              label={t('fields.amount')}
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="tabular-nums"
            />
            <Input
              label={t('fields.date')}
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
              max={todayYmd()}
            />
          </div>

          {amountDiffers !== 0 && (
            <p className="-mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              {t(amountDiffers < 0 ? 'editForm.lessThanInvoices' : 'editForm.moreThanInvoices', {
                total: formatCurrency(selectedTotal),
              })}
            </p>
          )}

          <div className={fieldRow}>
            <CustomSelect
              label={t('fields.method')}
              value={paymentMethod}
              onChange={(value) => setPaymentMethod(value)}
              options={paymentMethods}
            />
            <Input
              label={t('fields.transactionId')}
              type="text"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
            />
          </div>

          <Textarea label={t('fields.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 transition-colors hover:bg-gray-50 has-[:checked]:border-amber-300 has-[:checked]:bg-amber-50/70 dark:border-gray-800 dark:hover:bg-white/[0.02] dark:has-[:checked]:border-amber-500/30 dark:has-[:checked]:bg-amber-500/[0.06]">
            <input
              type="checkbox"
              checked={excludeFromTax}
              onChange={(e) => setExcludeFromTax(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900"
            />
            <span className="flex-1">
              <span className="block text-sm font-medium text-gray-900 dark:text-white">
                {tInvoices('recordPayment.excludeFromTax.label')}
              </span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                {tInvoices('recordPayment.excludeFromTax.description')}
              </span>
            </span>
          </label>
        </form>
      ) : (
        <div className="space-y-6">
          {/* Amount, type and date */}
          <div className="flex flex-col gap-3 rounded-xl border border-gray-200/70 bg-gray-50 p-4 dark:border-gray-800/70 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="eyebrow">{t('fields.amount')}</p>
              <p className={cn('mt-1 text-2xl font-semibold tracking-tight tabular-nums', typeInfo.amountClass)}>
                {formatCurrency(payment.amount)}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {formatDate(payment.payment_date, { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
            <Badge variant={typeInfo.variant} size="lg" icon={typeInfo.icon} className="self-start sm:self-center">
              {typeInfo.label}
            </Badge>
          </div>

          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {/* Payment Method */}
            {payment.payment_method && (
              <DetailItem label={t('fields.method')}>
                <span className="capitalize">{payment.payment_method.replace(/_/g, ' ')}</span>
              </DetailItem>
            )}

            {/* Transaction ID */}
            {payment.transaction_id && (
              <DetailItem label={t('fields.transactionId')}>
                <span className="break-all font-mono">{payment.transaction_id}</span>
              </DetailItem>
            )}

            {/* Linked Invoices - supports both single invoice_id and multiple linked_invoices */}
            {(payment.linked_invoices && payment.linked_invoices.length > 0) ? (
              <DetailItem label={t('fields.linkedInvoices', { defaultValue: 'Linked Invoices' })}>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {payment.linked_invoices.map((linkedInv) => (
                    onNavigateToInvoice ? (
                      <button
                        key={linkedInv.invoice_id}
                        type="button"
                        onClick={() => {
                          onClose();
                          onNavigateToInvoice(linkedInv.invoice_id);
                        }}
                        className={invoiceLinkClass}
                      >
                        {linkedInv.invoice_number}
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : (
                      <span key={linkedInv.invoice_id}>
                        {linkedInv.invoice_number}
                      </span>
                    )
                  ))}
                </div>
              </DetailItem>
            ) : payment.invoice_id && (
              <DetailItem label={t('fields.linkedInvoice')}>
                {onNavigateToInvoice ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToInvoice(payment.invoice_id!);
                    }}
                    className={invoiceLinkClass}
                  >
                    {payment.invoice_number || payment.invoice_id}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : (
                  <span>{payment.invoice_number || payment.invoice_id}</span>
                )}
              </DetailItem>
            )}

            {/* Notes */}
            {payment.notes && (
              <DetailItem label={t('fields.notes')} className="sm:col-span-2">
                <span className="block whitespace-pre-wrap text-gray-700 dark:text-gray-300">{payment.notes}</span>
              </DetailItem>
            )}

            {payment.exclude_from_tax && (
              <DetailItem label={tInvoices('recordPayment.excludeFromTax.label')} className="sm:col-span-2">
                <Badge variant="amber" size="sm">{tCommon('buttons.yes')}</Badge>
              </DetailItem>
            )}
          </dl>
        </div>
      )}
    </Modal>
  );
}
