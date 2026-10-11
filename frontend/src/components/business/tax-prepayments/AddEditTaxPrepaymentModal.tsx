import { useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarRange, FileText, Landmark, Paperclip, Trash2, type LucideIcon } from 'lucide-react';
import {
  useCreateTaxPrepayment,
  useUpdateTaxPrepayment,
  useTaxPrepayment,
  useUploadReceipt,
  useDeleteReceipt
} from '@/hooks/api/useTaxPrepayments';
import { TaxType, TaxPrepaymentStatus } from '@/api/types/tax-prepayment.types';
import { Input, CustomSelect, Textarea } from '@/components/forms';
import { FileDropZone } from '@/components/forms/FileDropZone';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/common/Button';
import { toast } from '@/lib/toast';
import { confirmDialog } from '@/lib/confirm';

interface AddEditTaxPrepaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  prepaymentId?: string;
}

/** Heading of one group of fields in the form. */
function SectionHeading({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-4 w-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
    </div>
  );
}

/**
 * One group of fields. Form fields carry a bottom margin; `flush` cancels the
 * last one so every section has the same spacing above and below.
 */
function FormSection({
  icon,
  title,
  children,
  flush = true,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="py-5 first:pt-0 last:pb-0">
      <SectionHeading icon={icon} title={title} />
      <div className={flush ? '-mb-4' : undefined}>{children}</div>
    </section>
  );
}

export function AddEditTaxPrepaymentModal({ isOpen, onClose, prepaymentId }: AddEditTaxPrepaymentModalProps) {
  const { t, i18n } = useTranslation('tax-prepayments');
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

      toast.success(isEditMode ? t('messages.updateSuccess') : t('messages.createSuccess'));
      onClose();
    } catch (error) {
      console.error('Failed to save tax prepayment:', error);
      toast.error(t('messages.saveFailed'));
    }
  };

  const handleDeleteReceipt = async () => {
    if (!prepaymentId) return;
    const confirmed = await confirmDialog({
      title: t('messages.confirmDeleteReceipt'),
      tone: 'danger',
      confirmLabel: t('actions.deleteReceipt'),
    });
    if (!confirmed) return;

    try {
      await deleteReceiptMutation.mutateAsync(prepaymentId);
      toast.success(t('messages.receiptDeleted'));
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

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={isEditMode ? t('editTaxPrepayment') : t('actions.add')}
      icon={<Landmark className="h-4 w-4" aria-hidden="true" />}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" form={formId} isLoading={isSaving}>
            {isSaving ? t('actions.saving') : t('actions.save')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="divide-y divide-gray-100 dark:divide-gray-800">
        {/* Payment */}
        <FormSection icon={Landmark} title={t('sections.payment')}>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {/* Tax Type */}
            <CustomSelect
              className="mb-4"
              label={t('fields.taxType')}
              value={taxType}
              onChange={(value) => setTaxType(value as TaxType)}
              options={taxTypeOptions}
              required
            />

            {/* Status */}
            <CustomSelect
              className="mb-4"
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
              className="tabular-nums"
            />

            {/* Payment Date */}
            <Input
              label={t('fields.paymentDate')}
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
            />

            {/* Payment Method */}
            <CustomSelect
              className="mb-4"
              label={t('fields.paymentMethod')}
              value={paymentMethod}
              onChange={setPaymentMethod}
              options={paymentMethodOptions}
            />

            {/* Reference Number */}
            <Input
              label={t('fields.referenceNumber')}
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder={t('fields.referenceNumberPlaceholder')}
            />
          </div>
        </FormSection>

        {/* Period */}
        <FormSection icon={CalendarRange} title={t('sections.period')}>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {/* Tax Year */}
            <CustomSelect
              className="mb-4"
              label={t('fields.taxYear')}
              value={taxYear}
              onChange={setTaxYear}
              options={yearOptions}
              required
            />

            {/* Quarter */}
            <CustomSelect
              className="mb-4"
              label={t('fields.quarter')}
              value={quarter}
              onChange={setQuarter}
              options={quarterOptions}
            />
          </div>
        </FormSection>

        {/* Details */}
        <FormSection icon={FileText} title={t('sections.details')}>
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
        </FormSection>

        {/* Receipt Upload */}
        <FormSection icon={Paperclip} title={t('fields.receipt')} flush={false}>
          <div className="space-y-3">
            {existingPrepayment?.receipt_filename && !receiptFile && (
              <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-800">
                <FileText className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
                  {existingPrepayment.receipt_filename}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDeleteReceipt}
                  isLoading={deleteReceiptMutation.isPending}
                  leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                >
                  {t('actions.deleteReceipt')}
                </Button>
              </div>
            )}

            <FileDropZone
              file={receiptFile}
              onFile={setReceiptFile}
              accept=".pdf,.jpg,.jpeg,.png"
              prompt={existingPrepayment?.receipt_filename ? t('receipt.replacePrompt') : t('receipt.dropPrompt')}
              hint={`${t('receipt.formats')} · ${t('messages.receiptMaxSize')}`}
              changeLabel={t('receipt.change')}
              removeLabel={t('receipt.remove')}
              locale={i18n.language}
            />
          </div>
        </FormSection>
      </form>
    </Modal>
  );
}
