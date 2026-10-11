import { Modal } from '@/components/ui/Modal';
import { Payment } from '@/api/types';
import { formatCurrency } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { useTranslation } from 'react-i18next';
import { ReactNode, useState, useEffect } from 'react';
import { useUpdatePayment } from '@/hooks/api/usePayments';
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Landmark, Wallet } from 'lucide-react';
import { Badge, BadgeVariant } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/cn';

interface PaymentDetailModalProps {
  payment: Payment | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToInvoice?: (invoiceId: string) => void;
}

/** Label + value in the payment details grid. */
function DetailItem({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-white">{children}</dd>
    </div>
  );
}

export function PaymentDetailModal({ payment, isOpen, onClose, onNavigateToInvoice }: PaymentDetailModalProps) {
  const { t } = useTranslation('payments');
  const { t: tInvoices } = useTranslation('invoices');
  const [excludeFromTax, setExcludeFromTax] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const updatePaymentMutation = useUpdatePayment();

  // Initialize state when payment changes
  useEffect(() => {
    if (payment && isOpen) {
      setExcludeFromTax(payment.exclude_from_tax || false);
      setIsEditing(false);
    }
  }, [payment?.id, isOpen]);

  if (!payment) return null;

  const handleSave = async () => {
    try {
      await updatePaymentMutation.mutateAsync({
        id: payment.id,
        payload: {
          exclude_from_tax: excludeFromTax,
        },
      });
      setIsEditing(false);
      toast.success(t('messages.updateSuccess'));
    } catch (error) {
      console.error('Failed to update payment:', error);
      toast.error(t('messages.updateFailed'));
    }
  };

  const handleCancel = () => {
    setExcludeFromTax(payment.exclude_from_tax || false);
    setIsEditing(false);
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
    'inline-flex items-center gap-1.5 rounded font-medium text-purple-600 transition-colors hover:text-purple-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 dark:text-purple-400 dark:hover:text-purple-300';

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={t('view')}
      size="md"
      footer={
        isEditing ? (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={handleCancel}
              disabled={updatePaymentMutation.isPending}
            >
              {t('messages.cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              isLoading={updatePaymentMutation.isPending}
            >
              {updatePaymentMutation.isPending ? t('messages.saving') : t('messages.saveChanges')}
            </Button>
          </>
        ) : undefined
      }
    >
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
        </dl>

        {/* Exclude from Tax - Editable Field */}
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 transition-colors hover:bg-gray-50 has-[:checked]:border-amber-300 has-[:checked]:bg-amber-50/70 dark:border-gray-800 dark:hover:bg-white/[0.02] dark:has-[:checked]:border-amber-500/30 dark:has-[:checked]:bg-amber-500/[0.06]">
          <input
            type="checkbox"
            checked={excludeFromTax}
            onChange={(e) => {
              setExcludeFromTax(e.target.checked);
              if (!isEditing) setIsEditing(true);
            }}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900"
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
      </div>
    </Modal>
  );
}
