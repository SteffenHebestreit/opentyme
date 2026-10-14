import React, { useState, useEffect, useMemo } from 'react';
import { getAppLocale } from '../../../utils/locale';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../ui/Modal';
import { Input, CustomSelect, Textarea } from '../../forms';
import { Button } from '../../common/Button';
import { Alert } from '../../common/Alert';
import { useCreatePayment } from '../../../hooks/api/usePayments';
import { useClients } from '../../../hooks/api/useClients';
import { useProjects } from '../../../hooks/api/useProjects';
import { useInvoices } from '../../../hooks/api/useInvoices';
import { InvoiceWithItems, PaymentType, Project, Client, Invoice } from '../../../api/types';
import { Check, HandCoins } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice?: InvoiceWithItems; // Optional - if not provided, user must select client/project/invoices
  onPaymentRecorded: () => void;
}

const formId = 'record-payment-form';

/** Two-column field row; Input's own bottom margin is dropped so rows line up. */
const fieldRow = 'grid gap-4 sm:grid-cols-2 [&>div]:mb-0';

// Format currency
const formatCurrency = (amount: number, currency: string = 'EUR'): string => {
  try {
    return new Intl.NumberFormat(getAppLocale(), {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `€${amount.toFixed(2)}`;
  }
};

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  invoice,
  onPaymentRecorded,
}) => {
  const { t } = useTranslation(['invoices', 'common']);
  
  // Fetch clients, projects, and invoices for standalone payment mode
  const { data: clients = [] } = useClients();
  const { data: allProjects = [] } = useProjects();
  const { data: allInvoices = [] } = useInvoices();
  
  // State for standalone payment mode
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  
  // Calculate already paid amount and remaining balance (only for single invoice mode)
  const totalPaid = invoice ? (invoice.payments || []).reduce((sum, p) => sum + p.amount, 0) : 0;
  const remainingBalance = invoice ? invoice.total_amount - totalPaid : 0;
  
  const [paymentType, setPaymentType] = useState<PaymentType>('payment');
  const [amount, setAmount] = useState<string>(invoice ? remainingBalance.toString() : '');
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [paymentMethod, setPaymentMethod] = useState<string>('bank_transfer');
  const [transactionId, setTransactionId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [excludeFromTax, setExcludeFromTax] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Use React Query mutation hook for automatic cache invalidation
  const createPaymentMutation = useCreatePayment();

  // Filter projects by selected client
  const availableProjects = Array.isArray(allProjects) 
    ? allProjects.filter((p: Project) => p.client_id === selectedClientId)
    : [];

  // Filter invoices by selected client - only show unpaid/partially paid invoices
  const availableInvoices = useMemo(() => {
    if (!selectedClientId || !Array.isArray(allInvoices)) return [];
    return allInvoices.filter((inv: Invoice) => 
      inv.client_id === selectedClientId && 
      ['sent', 'partially_paid', 'overdue'].includes(inv.status)
    );
  }, [allInvoices, selectedClientId]);

  // Calculate total of selected invoices
  const selectedInvoicesTotal = useMemo(() => {
    return availableInvoices
      .filter((inv: Invoice) => selectedInvoiceIds.includes(inv.id))
      .reduce((sum: number, inv: Invoice) => sum + Number(inv.total_amount), 0);
  }, [availableInvoices, selectedInvoiceIds]);

  // Toggle invoice selection
  const toggleInvoiceSelection = (invoiceId: string) => {
    setSelectedInvoiceIds(prev => 
      prev.includes(invoiceId) 
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    );
  };

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setPaymentType('payment');
      setAmount(invoice ? remainingBalance.toString() : '');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setPaymentMethod('bank_transfer');
      setTransactionId('');
      setNotes('');
      setExcludeFromTax(false);
      setSelectedClientId('');
      setSelectedProjectId('');
      setSelectedInvoiceIds([]);
      setError(null);
    }
  }, [isOpen, invoice, remainingBalance]);

  // Auto-set amount when invoices are selected
  useEffect(() => {
    if (!invoice && selectedInvoiceIds.length > 0 && selectedInvoicesTotal > 0) {
      setAmount(selectedInvoicesTotal.toString());
    }
  }, [invoice, selectedInvoiceIds, selectedInvoicesTotal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const paymentAmount = parseFloat(amount);
      
      // Validation
      if (isNaN(paymentAmount) || paymentAmount <= 0) {
        setError(t('recordPayment.errors.invalidAmount'));
        return;
      }

      // For single invoice-based payments, check against remaining balance
      if (invoice && paymentType === 'payment' && paymentAmount > remainingBalance) {
        setError(t('recordPayment.errors.exceedsBalance', { balance: formatCurrency(remainingBalance, invoice.currency) }));
        return;
      }

      // For standalone payments, ensure client is selected
      if (!invoice && !selectedClientId) {
        setError(t('recordPayment.errors.clientRequired', { defaultValue: 'Please select a client' }));
        return;
      }

      // Create payment using mutation hook
      // Use invoice_ids for multiple invoices, or invoice_id for single invoice
      await createPaymentMutation.mutateAsync({
        client_id: invoice ? invoice.client_id : selectedClientId,
        invoice_id: invoice ? invoice.id : (selectedInvoiceIds.length === 1 ? selectedInvoiceIds[0] : null),
        invoice_ids: invoice ? undefined : (selectedInvoiceIds.length > 0 ? selectedInvoiceIds : undefined),
        project_id: invoice ? (invoice.project_id || null) : (selectedProjectId || null),
        amount: paymentAmount,
        payment_type: paymentType,
        payment_method: paymentMethod,
        transaction_id: transactionId || null,
        payment_date: paymentDate,
        notes: notes || null,
        exclude_from_tax: excludeFromTax,
      });

      // Success!
      onPaymentRecorded();
      onClose();
      
      // Reset form
      setPaymentType('payment');
      setAmount('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setPaymentMethod('bank_transfer');
      setTransactionId('');
      setNotes('');
      setExcludeFromTax(false);
      setSelectedClientId('');
      setSelectedProjectId('');
      setSelectedInvoiceIds([]);
    } catch (err: any) {
      console.error('Error recording payment:', err);
      setError(err.response?.data?.message || err.response?.data?.details || t('recordPayment.errors.failed'));
    }
  };

  const paymentTypes = [
    { value: 'payment', label: t('recordPayment.types.payment.label'), description: t('recordPayment.types.payment.description') },
    { value: 'refund', label: t('recordPayment.types.refund.label'), description: t('recordPayment.types.refund.description') },
  ];

  const paymentMethods = [
    { value: 'cash', label: t('recordPayment.methods.cash') },
    { value: 'check', label: t('recordPayment.methods.check') },
    { value: 'credit_card', label: t('recordPayment.methods.creditCard') },
    { value: 'bank_transfer', label: t('recordPayment.methods.bankTransfer') },
    { value: 'paypal', label: t('recordPayment.methods.paypal') },
    { value: 'other', label: t('recordPayment.methods.other') },
  ];

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={invoice ? t('recordPayment.title') : t('recordPayment.titleStandalone', { defaultValue: 'Record Payment' })}
      icon={<HandCoins className="h-4 w-4" />}
      size="md"
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={createPaymentMutation.isPending}
          >
            {t('common:buttons.cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            isLoading={createPaymentMutation.isPending}
          >
            {createPaymentMutation.isPending ? t('recordPayment.recording') : t('recordPayment.submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-5">
        {/* Invoice Info (only shown if invoice provided) */}
        {invoice && (
          <dl className="space-y-2 rounded-xl border border-gray-200/70 bg-gray-50 p-4 text-sm tabular-nums dark:border-gray-800/70 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500 dark:text-gray-400">{t('recordPayment.info.invoice')}</dt>
              <dd className="font-medium text-gray-900 dark:text-white">{invoice.invoice_number}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500 dark:text-gray-400">{t('recordPayment.info.totalAmount')}</dt>
              <dd className="font-semibold text-gray-900 dark:text-white">{formatCurrency(invoice.total_amount, invoice.currency)}</dd>
            </div>
            {totalPaid > 0 && (
              <>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-gray-500 dark:text-gray-400">{t('recordPayment.info.alreadyPaid')}</dt>
                  <dd className="font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(totalPaid, invoice.currency)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-gray-200 pt-2 dark:border-gray-800">
                  <dt className="font-semibold text-gray-700 dark:text-gray-300">{t('recordPayment.info.remainingBalance')}</dt>
                  <dd className="text-base font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(remainingBalance, invoice.currency)}</dd>
                </div>
              </>
            )}
          </dl>
        )}

        {/* Client and Project Selection (only shown if no invoice provided) */}
        {!invoice && (
          <>
            <CustomSelect
              label={t('recordPayment.client', { defaultValue: 'Client' })}
              value={selectedClientId}
              onChange={(value) => {
                setSelectedClientId(value);
                setSelectedProjectId(''); // Reset project when client changes
                setSelectedInvoiceIds([]); // Reset invoice selection when client changes
              }}
              options={[
                { value: '', label: t('recordPayment.selectClient', { defaultValue: 'Select a client...' }) },
                ...(Array.isArray(clients) ? clients.map((client: Client) => ({ value: client.id, label: client.name })) : [])
              ]}
              required
            />

            {/* Invoice Selection - Multi-select */}
            {selectedClientId && availableInvoices.length > 0 && (
              <div className="animate-fade-in">
                <p className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('recordPayment.selectInvoices', { defaultValue: 'Select Invoice(s)' })}
                </p>
                <div className="max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200 dark:divide-gray-800/70 dark:border-gray-800">
                  {availableInvoices.map((inv: Invoice) => {
                    const selected = selectedInvoiceIds.includes(inv.id);
                    return (
                      <button
                        key={inv.id}
                        type="button"
                        onClick={() => toggleInvoiceSelection(inv.id)}
                        aria-pressed={selected}
                        className={cn(
                          'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-white/[0.04]',
                          selected
                            ? 'bg-brand-50/70 dark:bg-brand-500/10'
                            : 'hover:bg-gray-50 dark:hover:bg-white/[0.02]'
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
                          {formatCurrency(inv.total_amount, inv.currency)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {selectedInvoiceIds.length > 0 && (
                  <p className="mt-2 animate-fade-in text-sm text-brand-700 dark:text-brand-300">
                    {t('recordPayment.selectedTotal', { 
                      count: selectedInvoiceIds.length, 
                      defaultValue: `${selectedInvoiceIds.length} invoice(s) selected` 
                    })} · {t('recordPayment.total', { defaultValue: 'Total' })}:{' '}
                    <span className="font-semibold tabular-nums">{formatCurrency(selectedInvoicesTotal)}</span>
                  </p>
                )}
              </div>
            )}

            {selectedClientId && availableInvoices.length === 0 && (
              <p className="animate-fade-in rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
                {t('recordPayment.noUnpaidInvoices', { defaultValue: 'No unpaid invoices for this client' })}
              </p>
            )}

            {selectedClientId && (
              <CustomSelect
                label={t('recordPayment.project', { defaultValue: 'Project (Optional)' })}
                value={selectedProjectId}
                onChange={(value) => setSelectedProjectId(value)}
                options={[
                  { value: '', label: t('recordPayment.noProject', { defaultValue: 'No specific project' }) },
                  ...availableProjects.map((project: Project) => ({ value: project.id, label: project.name }))
                ]}
              />
            )}
          </>
        )}

        {error && <Alert type="error" message={error} />}

        {/* Payment Type */}
        <div>
          <CustomSelect
            label={t('recordPayment.paymentType')}
            value={paymentType}
            onChange={(value) => setPaymentType(value as PaymentType)}
            options={paymentTypes.map(type => ({ value: type.value, label: type.label }))}
            required
          />
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            {paymentTypes.find(t => t.value === paymentType)?.description}
          </p>
        </div>

        <div className={fieldRow}>
          {/* Payment Amount */}
          <Input
            label={paymentType === 'refund' ? t('recordPayment.refundAmount') : t('recordPayment.paymentAmount')}
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="0.00"
            max={invoice && paymentType === 'payment' ? remainingBalance : undefined}
            className="tabular-nums"
          />

          {/* Payment Date */}
          <Input
            label={t('recordPayment.paymentDate')}
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            required
            max={new Date().toISOString().split('T')[0]}
          />
        </div>

        <div className={fieldRow}>
          {/* Payment Method */}
          <CustomSelect
            label={t('recordPayment.paymentMethod')}
            value={paymentMethod}
            onChange={(value) => setPaymentMethod(value)}
            options={paymentMethods}
            required
          />

          {/* Transaction ID */}
          <Input
            label={t('recordPayment.transactionId')}
            type="text"
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            placeholder={t('recordPayment.transactionIdPlaceholder')}
          />
        </div>

        {/* Notes */}
        <Textarea
          label={t('recordPayment.notes')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder={t('recordPayment.notesPlaceholder')}
        />

        {/* Exclude from Tax */}
        <label
          htmlFor="record-payment-exclude-from-tax"
          className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 transition-colors hover:bg-gray-50 has-[:checked]:border-amber-300 has-[:checked]:bg-amber-50/70 dark:border-gray-800 dark:hover:bg-white/[0.02] dark:has-[:checked]:border-amber-500/30 dark:has-[:checked]:bg-amber-500/[0.06]"
        >
          <input
            type="checkbox"
            id="record-payment-exclude-from-tax"
            checked={excludeFromTax}
            onChange={(e) => setExcludeFromTax(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900"
          />
          <span className="flex-1">
            <span className="block text-sm font-medium text-gray-900 dark:text-white">
              {t('recordPayment.excludeFromTax.label')}
            </span>
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
              {t('recordPayment.excludeFromTax.description')}
            </span>
          </span>
        </label>
      </form>
    </Modal>
  );
};
