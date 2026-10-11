import { useExpense, useDeleteExpense, useUpdateExpense, useUploadReceipt, useDeleteReceipt, useRecurringGeneratedExpenses } from '@/hooks/api/useExpenses';
import { formatCurrency } from '@/utils/currency';
import { formatFileSize } from '@/utils/fileSize';
import { Textarea, Input, CustomSelect } from '@/components/forms';
import { FileDropZone } from '@/components/forms/FileDropZone';
import { fieldClasses, fieldLabelClass } from '@/components/forms/fieldStyles';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Alert } from '@/components/common/Alert';
import { EmptyState } from '@/components/common/EmptyState';
import { SkeletonItem } from '@/components/common/Skeleton';
import { useState, useEffect, type ReactNode } from 'react';
import {
  Calculator,
  Download,
  Eye,
  FileText,
  ListChecks,
  Paperclip,
  Pencil,
  Percent,
  Receipt,
  Repeat,
  Save,
  StickyNote,
  Tag,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import api from '@/api/services/client';
import { useTranslation } from 'react-i18next';
import { DepreciationSettings } from '@/components/business/expenses/DepreciationSettings';
import { DepreciationAnalysisSection } from '@/components/business/expenses/DepreciationAnalysisSection';
import { expenseCategoryLabel, getExpenseCategoryOptions } from '@/components/business/expenses/expenseCategories';
import { Slot } from '@/plugins/slots';
import { toast } from '@/lib/toast';
import { confirmDialog } from '@/lib/confirm';
import { extractErrorMessage } from '../../../utils/error';

interface ExpenseDetailModalProps {
  expenseId: string;
  isOpen: boolean;
  onClose: () => void;
  onExpenseUpdated: () => void;
}

/** Heading of one group of details. */
function SectionHeading({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-4 w-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      {children}
    </div>
  );
}

/** One label/value pair in a details grid. */
function Detail({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-white">{children}</dd>
    </div>
  );
}

const iconButtonClass =
  'rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white';

export function ExpenseDetailModal({
  expenseId,
  isOpen,
  onClose,
  onExpenseUpdated,
}: ExpenseDetailModalProps) {
  const { t, i18n } = useTranslation('expenses');
  const locale = i18n.language;
  const { data: expense, isLoading } = useExpense(expenseId, isOpen);
  const { data: generatedExpenses = [], isLoading: isLoadingGenerated } = useRecurringGeneratedExpenses(
    expenseId,
    isOpen && !!expense?.is_recurring
  );
  const deleteExpense = useDeleteExpense();
  const updateExpense = useUpdateExpense();
  const uploadReceipt = useUploadReceipt();
  const deleteReceipt = useDeleteReceipt();

  const [isEditing, setIsEditing] = useState(false);
  const [editedExpense, setEditedExpense] = useState<any>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);

  // Initialize edited expense when expense data loads or edit mode is toggled
  useEffect(() => {
    if (expense && isEditing && !editedExpense) {
      setEditedExpense({
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
        expense_date: expense.expense_date.split('T')[0],
        notes: expense.notes || '',
        recurrence_frequency: expense.recurrence_frequency || 'monthly',
        recurrence_start_date: expense.recurrence_start_date ? expense.recurrence_start_date.split('T')[0] : '',
        recurrence_end_date: expense.recurrence_end_date ? expense.recurrence_end_date.split('T')[0] : '',
        depreciation_type: expense.depreciation_type || null,
        depreciation_years: expense.depreciation_years || null,
        depreciation_method: expense.depreciation_method || null,
        useful_life_category: expense.useful_life_category || null, // Backend field name
        tax_deductible_amount: expense.tax_deductible_amount || null,
      });
    }
  }, [expense, isEditing, editedExpense]);

  // Fetch receipt image as blob for preview (with auth)
  useEffect(() => {
    if (showReceiptPreview && expense?.id) {
      const fetchReceiptBlob = async () => {
        try {
          const response = await api.get(`/expenses/${expense.id}/receipt/download`, {
            responseType: 'blob',
          });

          const blob = response.data as Blob;
          const url = URL.createObjectURL(blob);
          setReceiptPreviewUrl(url);
        } catch (error) {
          console.error('Failed to load receipt preview:', error);
        }
      };

      fetchReceiptBlob();
    }

    // Cleanup blob URL when modal closes
    return () => {
      if (receiptPreviewUrl) {
        URL.revokeObjectURL(receiptPreviewUrl);
        setReceiptPreviewUrl(null);
      }
    };
  }, [showReceiptPreview, expense?.id]);

  const handleDelete = async () => {
    const confirmed = await confirmDialog({
      title: t('messages.deleteConfirm'),
      message: t('detail.deleteMessage'),
      tone: 'danger',
      confirmLabel: t('delete'),
    });
    if (!confirmed) return;

    try {
      await deleteExpense.mutateAsync(expenseId);
      toast.success(t('messages.deleteSuccess'));
      onExpenseUpdated();
      onClose();
    } catch (error) {
      console.error('Failed to delete expense:', error);
      toast.error(t('messages.deleteFailed'), { description: extractErrorMessage(error) });
    }
  };

  const handleSaveEdit = async () => {
    if (!editedExpense) return;

    try {
      // Clean up data before sending to backend
      const dataToSend = { ...editedExpense };

      // Remove or null out empty recurrence fields if expense is not recurring
      if (!expense?.is_recurring) {
        delete dataToSend.recurrence_frequency;
        delete dataToSend.recurrence_start_date;
        delete dataToSend.recurrence_end_date;
      } else {
        // Convert empty strings to null for optional recurrence_end_date
        if (dataToSend.recurrence_end_date === '') {
          dataToSend.recurrence_end_date = null;
        }
      }

      // Set depreciation_start_date to expense_date if not set and depreciation is partial
      if (dataToSend.depreciation_type === 'partial' && !dataToSend.depreciation_start_date) {
        dataToSend.depreciation_start_date = expense?.expense_date || dataToSend.expense_date;
      }

      await updateExpense.mutateAsync({
        expenseId,
        data: dataToSend,
      });
      setIsEditing(false);
      setEditedExpense(null);
      toast.success(t('messages.updateSuccess'));
      onExpenseUpdated();
    } catch (error) {
      console.error('Failed to update expense:', error);
      // The API returns the detail under `message`, older paths under `error`.
      const fallback = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const reason = fallback ?? extractErrorMessage(error);
      toast.error(t('messages.updateFailed'), { description: reason });
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedExpense(null);
  };

  const isImage = (mimetype?: string | null) => mimetype?.startsWith('image/');

  const handleUploadReceipt = async () => {
    if (!receiptFile) return;

    try {
      await uploadReceipt.mutateAsync({ expenseId, file: receiptFile });
      setReceiptFile(null);
      toast.success(t('messages.uploadSuccess'));
      onExpenseUpdated();
    } catch (error) {
      console.error('Failed to upload receipt:', error);
      toast.error(t('messages.uploadFailed'));
    }
  };

  const handleDownloadReceipt = async () => {
    if (!expense) return;

    try {
      const response = await api.get(`/expenses/${expense.id}/receipt/download`, {
        responseType: 'blob',
      });

      // Create download link from blob
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = expense.receipt_filename || 'receipt';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download receipt:', error);
      toast.error(t('messages.downloadFailed'));
    }
  };

  const handleDeleteReceipt = async () => {
    const confirmed = await confirmDialog({
      title: t('receipt.deleteConfirm'),
      tone: 'danger',
      confirmLabel: t('receipt.delete'),
    });
    if (!confirmed) return;

    try {
      await deleteReceipt.mutateAsync(expenseId);
      toast.success(t('messages.receiptDeleted'));
      onExpenseUpdated();
    } catch (error) {
      console.error('Failed to delete receipt:', error);
      toast.error(t('messages.receiptDeleteFailed'));
    }
  };

  // getStatusBadgeColor removed - status field hidden for solo freelancer use

  const formatDay = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleDateString(locale) : '-';

  const getFrequencyLabel = (freq: string | null | undefined) => {
    switch (freq) {
      case 'monthly': return t('recurring.monthly', 'Monthly');
      case 'quarterly': return t('recurring.quarterly', 'Quarterly');
      case 'yearly': return t('recurring.yearly', 'Yearly');
      default: return freq || '-';
    }
  };

  const footer = expense
    ? isEditing ? (
        <>
          <Button type="button" variant="secondary" onClick={handleCancelEdit}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleSaveEdit}
            isLoading={updateExpense.isPending}
            leftIcon={<Save className="h-4 w-4" aria-hidden="true" />}
          >
            {updateExpense.isPending ? t('saving') : t('saveChanges')}
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={handleDelete}
            isLoading={deleteExpense.isPending}
            leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
            className="text-red-600 hover:bg-red-50 hover:text-red-700 sm:mr-auto dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
          >
            {deleteExpense.isPending ? t('deleting') : t('delete')}
          </Button>
          <Button
            type="button"
            onClick={() => setIsEditing(true)}
            leftIcon={<Pencil className="h-4 w-4" aria-hidden="true" />}
          >
            {t('edit')}
          </Button>
        </>
      )
    : undefined;

  const showDepreciation = !isEditing && expense?.depreciation_type && expense.depreciation_type !== 'none';
  const showDeductibility =
    !isEditing &&
    expense?.tax_deductible_percentage !== null &&
    expense?.tax_deductible_percentage !== undefined;

  return (
    <>
      {/* Main Expense Detail Modal */}
      <Modal
        open={isOpen}
        onClose={onClose}
        title={isEditing ? t('edit') : t('detail.title')}
        icon={<Receipt className="h-4 w-4" aria-hidden="true" />}
        size="lg"
        footer={footer}
      >
        {isLoading ? (
          <div className="space-y-6" aria-busy="true">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <SkeletonItem className="h-6 w-2/3" />
                <SkeletonItem className="h-4 w-1/3" />
              </div>
              <SkeletonItem className="h-8 w-28" />
            </div>
            <SkeletonItem className="h-20 w-full rounded-xl" />
            <SkeletonItem className="h-16 w-full rounded-xl" />
          </div>
        ) : expense ? (
          <div key={isEditing ? 'edit' : 'view'} className="flex animate-fade-in flex-col gap-6">
            {/* Main facts */}
            {isEditing ? (
              <div className="space-y-4">
                {expense.project_name && (
                  <dl>
                    <Detail label={t('fields.project')}>
                      {expense.project_name}
                      {expense.client_name && (
                        <span className="text-gray-500 dark:text-gray-400"> · {expense.client_name}</span>
                      )}
                    </Detail>
                  </dl>
                )}
                {/* Fields keep their bottom margin; cancel the last one */}
                <div className="-mb-4 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Input
                      label={t('fields.description')}
                      value={editedExpense?.description || ''}
                      onChange={(e) => setEditedExpense({ ...editedExpense, description: e.target.value })}
                      placeholder={t('fields.descriptionPlaceholder')}
                    />
                  </div>
                  <Input
                    label={t('fields.amount')}
                    type="number"
                    step="0.01"
                    value={editedExpense?.amount || ''}
                    onChange={(e) => setEditedExpense({ ...editedExpense, amount: parseFloat(e.target.value) })}
                    placeholder="0.00"
                    className="tabular-nums"
                  />
                  <Input
                    label={t('fields.date')}
                    type="date"
                    value={editedExpense?.expense_date || ''}
                    onChange={(e) => setEditedExpense({ ...editedExpense, expense_date: e.target.value })}
                  />
                  <CustomSelect
                    className="mb-4 sm:col-span-2"
                    label={t('fields.category')}
                    value={editedExpense?.category || ''}
                    onChange={(value) => setEditedExpense({ ...editedExpense, category: value })}
                    options={getExpenseCategoryOptions(t)}
                    size="md"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="break-words text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
                      {expense.description}
                    </h3>
                    {/* Status field hidden - not needed for solo freelancer (all expenses auto-approved) */}
                    {(expense.is_billable || expense.is_reimbursable || expense.is_recurring) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {expense.is_billable && <Badge variant="green">{t('fields.billable')}</Badge>}
                        {expense.is_reimbursable && <Badge variant="blue">{t('fields.isReimbursable')}</Badge>}
                        {expense.is_recurring && (
                          <Badge variant="purple" icon={<Repeat className="h-3 w-3" aria-hidden="true" />}>
                            {t('recurring.recurring', 'Recurring')}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="shrink-0 text-2xl font-semibold tracking-tight tabular-nums text-gray-900 sm:text-right dark:text-white">
                    {formatCurrency(expense.amount, expense.currency)}
                  </p>
                </div>

                <dl className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-xl bg-gray-50 p-4 ring-1 ring-inset ring-gray-200 sm:grid-cols-3 dark:bg-white/[0.03] dark:ring-gray-800">
                  <Detail label={t('fields.date')}>
                    <span className="tabular-nums">{formatDay(expense.expense_date)}</span>
                  </Detail>
                  <Detail label={t('fields.category')}>{expenseCategoryLabel(t, expense.category)}</Detail>
                  <Detail label={t('fields.project')}>
                    {expense.project_name ? (
                      <>
                        {expense.project_name}
                        {expense.client_name && (
                          <span className="text-gray-500 dark:text-gray-400"> · {expense.client_name}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">{t('noProject')}</span>
                    )}
                  </Detail>
                </dl>
              </div>
            )}

            {/* Auto-Generated Expense Information */}
            {expense.parent_expense_id && (
              <Alert
                type="info"
                title={t('recurring.autoGenerated', 'Auto-generated')}
                message={t('recurring.generatedFromTemplate', 'This expense was automatically generated from a recurring expense template')}
              />
            )}

            {/* Recurring Expense Information */}
            {expense.is_recurring && (
              <section>
                <SectionHeading icon={Repeat} title={t('recurring.isRecurring', 'Recurring Expense')} />
                {isEditing ? (
                  <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 p-4 sm:grid-cols-2 dark:border-gray-800">
                    {/* Frequency */}
                    <div>
                      <label htmlFor={`expense-frequency-${expenseId}`} className={fieldLabelClass()}>
                        {t('recurring.frequency', 'Frequency')}
                      </label>
                      <select
                        id={`expense-frequency-${expenseId}`}
                        value={editedExpense?.recurrence_frequency || 'monthly'}
                        onChange={(e) => setEditedExpense({ ...editedExpense, recurrence_frequency: e.target.value })}
                        className={fieldClasses()}
                      >
                        <option value="monthly">{t('recurring.monthly', 'Monthly')}</option>
                        <option value="quarterly">{t('recurring.quarterly', 'Quarterly')}</option>
                        <option value="yearly">{t('recurring.yearly', 'Yearly')}</option>
                      </select>
                    </div>

                    {/* Start Date */}
                    <div>
                      <label htmlFor={`expense-recurrence-start-${expenseId}`} className={fieldLabelClass()}>
                        {t('recurring.startDate', 'Start Date')}
                      </label>
                      <input
                        id={`expense-recurrence-start-${expenseId}`}
                        type="date"
                        value={editedExpense?.recurrence_start_date || ''}
                        onChange={(e) => setEditedExpense({ ...editedExpense, recurrence_start_date: e.target.value })}
                        className={fieldClasses()}
                      />
                    </div>

                    {/* End Date */}
                    <div className="sm:col-span-2">
                      <label htmlFor={`expense-recurrence-end-${expenseId}`} className={fieldLabelClass()}>
                        {t('recurring.endDate', 'End Date (Optional)')}
                      </label>
                      <input
                        id={`expense-recurrence-end-${expenseId}`}
                        type="date"
                        value={editedExpense?.recurrence_end_date || ''}
                        onChange={(e) => setEditedExpense({ ...editedExpense, recurrence_end_date: e.target.value })}
                        className={fieldClasses()}
                      />
                    </div>
                  </div>
                ) : (
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-gray-200 p-4 sm:grid-cols-4 dark:border-gray-800">
                    <Detail label={t('recurring.frequency', 'Frequency')}>
                      {getFrequencyLabel(expense.recurrence_frequency)}
                    </Detail>
                    <Detail label={t('recurring.startDate', 'Start Date')}>
                      <span className="tabular-nums">{formatDay(expense.recurrence_start_date)}</span>
                    </Detail>
                    {expense.recurrence_end_date && (
                      <Detail label={t('recurring.endDateShort')}>
                        <span className="tabular-nums">{formatDay(expense.recurrence_end_date)}</span>
                      </Detail>
                    )}
                    {expense.next_occurrence && (
                      <Detail label={t('recurring.nextOccurrence', 'Next Generation')}>
                        <span className="tabular-nums">{formatDay(expense.next_occurrence)}</span>
                      </Detail>
                    )}
                  </dl>
                )}
              </section>
            )}

            {/* Generated Expenses List */}
            {expense.is_recurring && !expense.parent_expense_id && (
              <section>
                <SectionHeading icon={ListChecks} title={t('recurring.generatedExpenses', 'Generated Expenses')}>
                  {!isLoadingGenerated && generatedExpenses.length > 0 && (
                    <Badge variant="purple" size="sm">
                      <span className="tabular-nums">{generatedExpenses.length}</span>
                    </Badge>
                  )}
                </SectionHeading>

                {isLoadingGenerated ? (
                  <div className="space-y-2" aria-busy="true">
                    <SkeletonItem className="h-12 w-full rounded-lg" />
                    <SkeletonItem className="h-12 w-full rounded-lg" />
                  </div>
                ) : generatedExpenses.length > 0 ? (
                  <ul className="max-h-60 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200 dark:divide-gray-800/70 dark:border-gray-800">
                    {generatedExpenses.map((generated) => (
                      <li
                        key={generated.id}
                        className="flex items-center justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                            {formatDay(generated.expense_date)}
                          </p>
                          {generated.description && (
                            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                              {generated.description}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                            {formatCurrency(generated.amount, generated.currency)}
                          </span>
                          <Badge
                            size="sm"
                            variant={
                              generated.status === 'approved'
                                ? 'green'
                                : generated.status === 'rejected'
                                ? 'red'
                                : 'yellow'
                            }
                          >
                            {generated.status === 'approved'
                              ? t('status.approved')
                              : generated.status === 'rejected'
                              ? t('status.rejected')
                              : t('status.pending')}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('recurring.noGeneratedYet', 'No expenses have been generated yet. The scheduler will create them automatically.')}
                  </p>
                )}
              </section>
            )}

            {/* Receipt */}
            <section>
              <SectionHeading icon={Paperclip} title={t('fields.receipt')} />

              {expense.receipt_url ? (
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-800">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600 ring-1 ring-inset ring-purple-600/10 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-400/20">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {expense.receipt_filename}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {formatFileSize(expense.receipt_size, locale) ?? t('receipt.unknownSize')}
                      {expense.receipt_mimetype && ` · ${expense.receipt_mimetype}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {isImage(expense.receipt_mimetype) && (
                      <button
                        type="button"
                        onClick={() => setShowReceiptPreview(true)}
                        className={iconButtonClass}
                        title={t('receipt.preview')}
                        aria-label={t('receipt.preview')}
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleDownloadReceipt}
                      className={iconButtonClass}
                      title={t('receipt.download')}
                      aria-label={t('receipt.download')}
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteReceipt}
                      disabled={deleteReceipt.isPending}
                      className={`${iconButtonClass} hover:text-red-600 dark:hover:text-red-400`}
                      title={t('receipt.delete')}
                      aria-label={t('receipt.delete')}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <FileDropZone
                    file={receiptFile}
                    onFile={setReceiptFile}
                    accept="image/*,application/pdf"
                    prompt={t('receipt.dropPrompt')}
                    hint={t('receiptMaxSize')}
                    changeLabel={t('receipt.change')}
                    removeLabel={t('receipt.remove')}
                    locale={locale}
                  />
                  {receiptFile && (
                    <div className="flex animate-fade-in justify-end">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleUploadReceipt}
                        isLoading={uploadReceipt.isPending}
                        leftIcon={<Upload className="h-4 w-4" aria-hidden="true" />}
                      >
                        {uploadReceipt.isPending ? t('receipt.uploading') : t('receipt.upload')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Notes */}
            <section>
              {isEditing ? (
                <div className="-mb-4">
                  <Textarea
                    label={t('fields.notes')}
                    value={editedExpense?.notes || ''}
                    onChange={(e) => setEditedExpense({ ...editedExpense, notes: e.target.value })}
                    placeholder={t('notesPlaceholder')}
                    rows={3}
                  />
                </div>
              ) : (
                <>
                  <SectionHeading icon={StickyNote} title={t('fields.notes')} />
                  {expense.notes ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                      {expense.notes}
                    </p>
                  ) : (
                    <p className="text-sm italic text-gray-400 dark:text-gray-500">{t('detail.noNotes')}</p>
                  )}
                </>
              )}
            </section>

            {/* Depreciation Settings */}
            {isEditing && (
              <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <DepreciationSettings
                  depreciationType={editedExpense?.depreciation_type}
                  depreciationYears={editedExpense?.depreciation_years}
                  depreciationMethod={editedExpense?.depreciation_method}
                  onChange={(field, value) => {
                    setEditedExpense({ ...editedExpense, [field]: value });
                  }}
                />
              </section>
            )}

            {/* Depreciation Info and Tax Deductibility (View Mode) */}
            {(showDepreciation || showDeductibility) && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {showDepreciation && (
                  <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <SectionHeading icon={Calculator} title={t('depreciation.title', 'Depreciation (AfA)')} />
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500 dark:text-gray-400">{t('analysis.type')}</dt>
                        <dd className="text-right font-medium text-gray-900 dark:text-white">
                          {expense.depreciation_type === 'immediate'
                            ? t('analysis.typeImmediate')
                            : t('analysis.typePartial')}
                        </dd>
                      </div>
                      {expense.depreciation_type === 'partial' && (
                        <>
                          <div className="flex justify-between gap-4">
                            <dt className="text-gray-500 dark:text-gray-400">{t('analysis.period')}</dt>
                            <dd className="text-right font-medium tabular-nums text-gray-900 dark:text-white">
                              {t('analysis.yearsCount', { count: expense.depreciation_years ?? 0 })}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-gray-500 dark:text-gray-400">{t('depreciation.method', 'Method')}</dt>
                            <dd className="text-right font-medium text-gray-900 dark:text-white">
                              {expense.depreciation_method === 'degressive'
                                ? t('analysis.methodDegressive')
                                : expense.depreciation_method === 'linear'
                                ? t('analysis.methodLinear')
                                : expense.depreciation_method}
                            </dd>
                          </div>
                        </>
                      )}
                      {expense.tax_deductible_amount && (
                        <div className="flex justify-between gap-4 border-t border-gray-100 pt-2 dark:border-gray-800">
                          <dt className="text-gray-500 dark:text-gray-400">{t('depreciation.taxDeductible')}</dt>
                          <dd className="text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                            {formatCurrency(expense.tax_deductible_amount, expense.currency)}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </section>
                )}

                {showDeductibility && expense.tax_deductible_percentage !== undefined && (
                  <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <SectionHeading icon={Percent} title={t('detail.taxDeductibility')} />
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500 dark:text-gray-400">{t('detail.deductiblePercentage')}</dt>
                        <dd className="text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                          {expense.tax_deductible_percentage}%
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500 dark:text-gray-400">{t('detail.deductibleAmount')}</dt>
                        <dd className="text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                          {formatCurrency(
                            (parseFloat(expense.net_amount?.toString() || '0') * expense.tax_deductible_percentage) / 100,
                            expense.currency
                          )}
                        </dd>
                      </div>
                    </dl>
                    {expense.tax_deductibility_reasoning && (
                      <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                        <p className="eyebrow mb-1">{t('detail.aiAnalysis')}</p>
                        <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                          {expense.tax_deductibility_reasoning}
                        </p>
                      </div>
                    )}
                    {expense.tax_deductibility_analysis_date && (
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {t('detail.analyzedOn', { date: formatDay(expense.tax_deductibility_analysis_date) })}
                      </p>
                    )}
                  </section>
                )}
              </div>
            )}

            {/* AI Depreciation Analysis - Only show in edit mode */}
            {expense && isEditing && (
              <section>
                <DepreciationAnalysisSection
                  expenseId={expenseId}
                  netAmount={parseFloat(expense.net_amount?.toString() || '0')}
                  expenseDate={expense.expense_date}
                  existingAnalysis={expense.ai_analysis_response ? JSON.stringify(expense.ai_analysis_response) : null}
                  onSuccess={onExpenseUpdated}
                  isEditing={isEditing}
                  onApplyToForm={(settings) => {
                    if (isEditing && editedExpense) {
                      setEditedExpense({
                        ...editedExpense,
                        depreciation_type: settings.depreciation_type,
                        depreciation_years: settings.depreciation_years,
                        depreciation_start_date: settings.depreciation_start_date,
                        depreciation_method: settings.depreciation_method,
                        useful_life_category: settings.useful_life_category,
                        category: settings.category || editedExpense.category, // Apply AI-suggested category
                        tax_deductible_percentage: settings.tax_deductible_percentage,
                        tax_deductibility_reasoning: settings.tax_deductibility_reasoning,
                      });
                    }
                  }}
                />
              </section>
            )}

            {/* Tags */}
            {expense.tags && expense.tags.length > 0 && (
              <section>
                <SectionHeading icon={Tag} title={t('detail.tags')} />
                <div className="flex flex-wrap gap-1.5">
                  {expense.tags.map((tag, index) => (
                    <Badge key={index} variant="gray">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {/* Addon injection point: expense detail actions
                Addons receive the full expense object and update callback.
                Use this slot for per-expense analysis buttons, export actions, etc. */}
            {expense && (
              <Slot
                name="expense-detail-actions"
                context={{ expense, onExpenseUpdated, isEditing }}
              />
            )}
          </div>
        ) : (
          <EmptyState compact icon={Receipt} title={t('detail.notFound')} />
        )}
      </Modal>

      {/* Receipt Preview Modal */}
      <Modal
        open={showReceiptPreview && !!expense?.receipt_url && !!isImage(expense?.receipt_mimetype)}
        onClose={() => setShowReceiptPreview(false)}
        title={expense?.receipt_filename || t('receipt.previewTitle')}
        icon={<Eye className="h-4 w-4" aria-hidden="true" />}
        size="xl"
      >
        <div className="flex min-h-[16rem] items-center justify-center rounded-lg bg-gray-100 p-4 dark:bg-gray-950/60">
          {receiptPreviewUrl ? (
            <img
              src={receiptPreviewUrl}
              alt={t('receipt.previewAlt')}
              className="max-h-[70vh] max-w-full animate-fade-in rounded object-contain"
            />
          ) : (
            <SkeletonItem className="h-64 w-full max-w-md" />
          )}
        </div>
      </Modal>
    </>
  );
}
