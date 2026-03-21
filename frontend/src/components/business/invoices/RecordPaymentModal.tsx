import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../ui/Modal';
import { Input, CustomSelect, Textarea } from '../../forms';
import { Button } from '../../common/Button';
import { useCreatePayment } from '../../../hooks/api/usePayments';
import { useClients } from '../../../hooks/api/useClients';
import { useProjects } from '../../../hooks/api/useProjects';
import { useInvoices } from '../../../hooks/api/useInvoices';
import { InvoiceWithItems, PaymentType, Project, Client, Invoice } from '../../../api/types';
import { Check } from 'lucide-react';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice?: InvoiceWithItems; // Optional - if not provided, user must select client/project/invoices
  onPaymentRecorded: () => void;
}

// Format currency
const formatCurrency = (amount: number, currency: string = 'EUR'): string => {
  try {
    return new Intl.NumberFormat(undefined, {
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
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Invoice Info (only shown if invoice provided) */}
        {invoice && (
          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-400">{t('recordPayment.info.invoice')}:</span>
              <span className="text-white font-medium">{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-400">{t('recordPayment.info.totalAmount')}:</span>
              <span className="text-white font-bold">{formatCurrency(invoice.total_amount, invoice.currency)}</span>
            </div>
            {totalPaid > 0 && (
              <>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400">{t('recordPayment.info.alreadyPaid')}:</span>
                  <span className="text-green-400 font-medium">{formatCurrency(totalPaid, invoice.currency)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-700">
                  <span className="text-gray-300 font-semibold">{t('recordPayment.info.remainingBalance')}:</span>
                  <span className="text-orange-400 font-bold text-lg">{formatCurrency(remainingBalance, invoice.currency)}</span>
                </div>
              </>
            )}
          </div>
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
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {t('recordPayment.selectInvoices', { defaultValue: 'Select Invoice(s)' })}
                </label>
                <div className="max-h-48 overflow-y-auto border border-gray-700 rounded-lg divide-y divide-gray-700">
                  {availableInvoices.map((inv: Invoice) => (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => toggleInvoiceSelection(inv.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                        selectedInvoiceIds.includes(inv.id)
                          ? 'bg-purple-900/30 border-l-2 border-purple-500'
                          : 'hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{inv.invoice_number}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            inv.status === 'overdue' ? 'bg-red-900/50 text-red-300' :
                            inv.status === 'partially_paid' ? 'bg-yellow-900/50 text-yellow-300' :
                            'bg-blue-900/50 text-blue-300'
                          }`}>
                            {inv.status}
                          </span>
                        </div>
                        <div className="text-sm text-gray-400">
                          {formatCurrency(inv.total_amount, inv.currency)}
                        </div>
                      </div>
                      {selectedInvoiceIds.includes(inv.id) && (
                        <Check className="h-5 w-5 text-purple-400" />
                      )}
                    </button>
                  ))}
                </div>
                {selectedInvoiceIds.length > 0 && (
                  <div className="mt-2 text-sm text-purple-300">
                    {t('recordPayment.selectedTotal', { 
                      count: selectedInvoiceIds.length, 
                      defaultValue: `${selectedInvoiceIds.length} invoice(s) selected` 
                    })} - {t('recordPayment.total', { defaultValue: 'Total' })}: {formatCurrency(selectedInvoicesTotal)}
                  </div>
                )}
              </div>
            )}

            {selectedClientId && availableInvoices.length === 0 && (
              <div className="text-sm text-gray-400 italic">
                {t('recordPayment.noUnpaidInvoices', { defaultValue: 'No unpaid invoices for this client' })}
              </div>
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

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Payment Type */}
        <div>
          <CustomSelect
            label={t('recordPayment.paymentType')}
            value={paymentType}
            onChange={(value) => setPaymentType(value as PaymentType)}
            options={paymentTypes.map(type => ({ value: type.value, label: type.label }))}
            required
          />
          <p className="mt-1 text-sm text-gray-400">
            {paymentTypes.find(t => t.value === paymentType)?.description}
          </p>
        </div>

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

        {/* Notes */}
        <Textarea
          label={t('recordPayment.notes')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder={t('recordPayment.notesPlaceholder')}
        />

        {/* Exclude from Tax */}
        <div className="flex items-start space-x-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <input
            type="checkbox"
            id="exclude_from_tax"
            checked={excludeFromTax}
            onChange={(e) => setExcludeFromTax(e.target.checked)}
            className="mt-1 h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
          />
          <div className="flex-1">
            <label htmlFor="exclude_from_tax" className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer">
              {t('recordPayment.excludeFromTax.label')}
            </label>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {t('recordPayment.excludeFromTax.description')}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end pt-4">
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
            variant="primary"
            disabled={createPaymentMutation.isPending}
          >
            {createPaymentMutation.isPending ? t('recordPayment.recording') : t('recordPayment.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
