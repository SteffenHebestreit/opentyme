import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  useCreateTaxPrepayment, 
  useUpdateTaxPrepayment, 
  useTaxPrepayment,
  useUploadReceipt,
  useDeleteReceipt
} from '@/hooks/api/useTaxPrepayments';
import { TaxType, TaxPrepaymentStatus } from '@/api/types/tax-prepayment.types';
import { Input, CustomSelect, Textarea } from '@/components/forms';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/common/Button';

interface AddEditTaxPrepaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  prepaymentId?: string;
}

export function AddEditTaxPrepaymentModal({ isOpen, onClose, prepaymentId }: AddEditTaxPrepaymentModalProps) {
  const { t } = useTranslation('tax-prepayments');
  const isEditMode = !!prepaymentId;

  // Form state
  const [taxType, setTaxType] = useState<TaxType>(TaxType.VAT);
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [taxYear, setTaxYear] = useState(new Date().getFullYear().toString());
  const [quarter, setQuarter] = useState<string>('');
  const [description, setDescription] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<TaxPrepaymentStatus>(TaxPrepaymentStatus.PAID);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  // Mutations
  const createMutation = useCreateTaxPrepayment();
  const updateMutation = useUpdateTaxPrepayment();
  const uploadReceiptMutation = useUploadReceipt();
  const deleteReceiptMutation = useDeleteReceipt();

  // Load existing prepayment data if editing
  const { data: existingPrepayment } = useTaxPrepayment(prepaymentId || '');

  useEffect(() => {
    if (existingPrepayment && isEditMode) {
      setTaxType(existingPrepayment.tax_type);
      setAmount(existingPrepayment.amount.toString());
      setPaymentDate(existingPrepayment.payment_date.split('T')[0]);
      setTaxYear(existingPrepayment.tax_year.toString());
      setQuarter(existingPrepayment.quarter?.toString() || '');
      setDescription(existingPrepayment.description || '');
      setReferenceNumber(existingPrepayment.reference_number || '');
      setPaymentMethod(existingPrepayment.payment_method || '');
      setNotes(existingPrepayment.notes || '');
      setStatus(existingPrepayment.status);
    }
  }, [existingPrepayment, isEditMode]);

  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      setTaxType(TaxType.VAT);
      setAmount('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setTaxYear(new Date().getFullYear().toString());
      setQuarter('');
      setDescription('');
      setReferenceNumber('');
      setPaymentMethod('');
      setNotes('');
      setStatus(TaxPrepaymentStatus.PAID);
      setReceiptFile(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      tax_type: taxType,
      amount: parseFloat(amount),
      payment_date: paymentDate,
      tax_year: parseInt(taxYear),
      quarter: quarter ? parseInt(quarter) : undefined,
      description: description || undefined,
      reference_number: referenceNumber || undefined,
      payment_method: paymentMethod || undefined,
      notes: notes || undefined,
      status,
    };

    try {
      let resultPrepaymentId: string;

      if (isEditMode && prepaymentId) {
        await updateMutation.mutateAsync({ id: prepaymentId, data });
        resultPrepaymentId = prepaymentId;
      } else {
        const newPrepayment = await createMutation.mutateAsync(data);
        resultPrepaymentId = newPrepayment.id;
      }

      // Upload receipt if provided
      if (receiptFile) {
        await uploadReceiptMutation.mutateAsync({ id: resultPrepaymentId, file: receiptFile });
      }

      onClose();
    } catch (error) {
      console.error('Failed to save tax prepayment:', error);
    }
  };

  const handleDeleteReceipt = async () => {
    if (!prepaymentId || !confirm(t('messages.confirmDeleteReceipt'))) return;

    try {
      await deleteReceiptMutation.mutateAsync(prepaymentId);
    } catch (error) {
      console.error('Failed to delete receipt:', error);
    }
  };

  const formId = 'add-edit-tax-prepayment-form';

  // Options
  const taxTypeOptions = [
    { value: TaxType.VAT, label: t('taxTypes.vat') },
    { value: TaxType.INCOME_TAX, label: t('taxTypes.incomeTax') },
  ];

  const statusOptions = [
    { value: TaxPrepaymentStatus.PAID, label: t('status.paid') },
    { value: TaxPrepaymentStatus.PLANNED, label: t('status.planned') },
    { value: TaxPrepaymentStatus.CANCELLED, label: t('status.cancelled') },
    { value: TaxPrepaymentStatus.REFUND, label: t('status.refund') },
  ];

  const quarterOptions = [
    { value: '', label: t('quarters.none') },
    { value: '1', label: t('quarters.q1') },
    { value: '2', label: t('quarters.q2') },
    { value: '3', label: t('quarters.q3') },
    { value: '4', label: t('quarters.q4') },
  ];

  const yearOptions = Array.from({ length: 10 }, (_, i) => {
    const year = new Date().getFullYear() - 5 + i;
    return { value: year.toString(), label: year.toString() };
  });

  const paymentMethodOptions = [
    { value: '', label: t('paymentMethods.select') },
    { value: 'bank_transfer', label: t('paymentMethods.bankTransfer') },
    { value: 'direct_debit', label: t('paymentMethods.directDebit') },
    { value: 'check', label: t('paymentMethods.check') },
    { value: 'cash', label: t('paymentMethods.cash') },
    { value: 'other', label: t('paymentMethods.other') },
  ];

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={isEditMode ? t('actions.edit') : t('actions.add')}
      size="xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={createMutation.isPending || updateMutation.isPending}>
            {createMutation.isPending || updateMutation.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Tax Type */}
          <CustomSelect
            label={t('fields.taxType')}
            value={taxType}
            onChange={(value) => setTaxType(value as TaxType)}
            options={taxTypeOptions}
            required
          />

          {/* Status */}
          <CustomSelect
            label={t('fields.status')}
            value={status}
            onChange={(value) => setStatus(value as TaxPrepaymentStatus)}
            options={statusOptions}
            required
          />

          {/* Amount */}
          <Input
            label={t('fields.amount')}
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="0.00"
          />

          {/* Payment Date */}
          <Input
            label={t('fields.paymentDate')}
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            required
          />

          {/* Tax Year */}
          <CustomSelect
            label={t('fields.taxYear')}
            value={taxYear}
            onChange={setTaxYear}
            options={yearOptions}
            required
          />

          {/* Quarter */}
          <CustomSelect
            label={t('fields.quarter')}
            value={quarter}
            onChange={setQuarter}
            options={quarterOptions}
          />

          {/* Reference Number */}
          <Input
            label={t('fields.referenceNumber')}
            type="text"
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder={t('fields.referenceNumberPlaceholder')}
          />

          {/* Payment Method */}
          <CustomSelect
            label={t('fields.paymentMethod')}
            value={paymentMethod}
            onChange={setPaymentMethod}
            options={paymentMethodOptions}
          />
        </div>

        {/* Description */}
        <Input
          label={t('fields.description')}
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('fields.descriptionPlaceholder')}
        />

        {/* Notes */}
        <Textarea
          label={t('fields.notes')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('fields.notesPlaceholder')}
          rows={3}
        />

        {/* Receipt Upload */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('fields.receipt')}
          </label>
          
          {existingPrepayment?.receipt_filename && !receiptFile && (
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {existingPrepayment.receipt_filename}
                </span>
              </div>
              <button
                type="button"
                onClick={handleDeleteReceipt}
                className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm"
              >
                {t('actions.deleteReceipt')}
              </button>
            </div>
          )}

          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500 dark:text-gray-400
              file:mr-4 file:py-2 file:px-4
              file:rounded-lg file:border-0
              file:text-sm file:font-semibold
              file:bg-purple-50 file:text-purple-700
              hover:file:bg-purple-100
              dark:file:bg-purple-900/30 dark:file:text-purple-400
              dark:hover:file:bg-purple-900/50"
          />
          {receiptFile && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('messages.fileSelected')}: {receiptFile.name}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
