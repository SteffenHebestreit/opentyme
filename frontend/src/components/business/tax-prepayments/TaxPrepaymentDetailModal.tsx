import { useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaxPrepayment, useDeleteTaxPrepayment, useDeleteReceipt } from '@/hooks/api/useTaxPrepayments';
import { formatCurrency } from '@/utils/currency';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/common/Button';
import { Badge, type BadgeVariant } from '@/components/common/Badge';
import { SkeletonItem } from '@/components/common/Skeleton';
import { toast } from '@/lib/toast';
import { confirmDialog } from '@/lib/confirm';
import { cn } from '@/lib/cn';
import {
  CalendarRange,
  Download,
  Eye,
  FileText,
  Info,
  Landmark,
  Paperclip,
  Pencil,
  StickyNote,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import api from '@/api/services/client';

interface TaxPrepaymentDetailModalProps {
  prepaymentId: string;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
}

/** Heading of one group of details. */
function SectionHeading({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-4 w-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
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

const statusVariants: Record<string, BadgeVariant> = {
  paid: 'green',
  planned: 'yellow',
  cancelled: 'red',
  refund: 'blue',
};

const iconButtonClass =
  'rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white';

export function TaxPrepaymentDetailModal({
  prepaymentId,
  isOpen,
  onClose,
  onEdit,
}: TaxPrepaymentDetailModalProps) {
  const { t, i18n } = useTranslation('tax-prepayments');
  const { data: prepayment, isLoading } = useTaxPrepayment(prepaymentId);
  const deleteMutation = useDeleteTaxPrepayment();
  const deleteReceiptMutation = useDeleteReceipt();
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);

  // Fetch receipt image as blob for preview (with auth)
  useEffect(() => {
    if (showReceiptPreview && prepayment?.id && prepayment.receipt_filename) {
      const fetchReceiptBlob = async () => {
        try {
          const response = await api.get(`/tax-prepayments/${prepayment.id}/receipt/download`, {
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
  }, [showReceiptPreview, prepayment?.id, prepayment?.receipt_filename]);

  const handleDelete = async () => {
    const confirmed = await confirmDialog({
      title: t('messages.confirmDelete'),
      tone: 'danger',
      confirmLabel: t('actions.delete'),
    });
    if (!confirmed) return;

    try {
      await deleteMutation.mutateAsync(prepaymentId);
      toast.success(t('messages.deleteSuccess'));
      onClose();
    } catch (error) {
      console.error('Failed to delete tax prepayment:', error);
      toast.error(t('messages.deleteFailed'));
    }
  };

  const handleDownloadReceipt = async () => {
    if (!prepayment?.receipt_filename) return;

    try {
      const response = await api.get(`/tax-prepayments/${prepaymentId}/receipt/download`, {
        responseType: 'blob',
      });

      const blob = response.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = prepayment.receipt_filename;
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <Modal open={isOpen} onClose={onClose} title={t('details.title')} icon={<Landmark className="h-4 w-4" aria-hidden="true" />} size="md">
        <div className="space-y-6" aria-busy="true">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <SkeletonItem className="h-6 w-1/2" />
              <SkeletonItem className="h-5 w-20 rounded-full" />
            </div>
            <SkeletonItem className="h-8 w-28" />
          </div>
          <SkeletonItem className="h-24 w-full rounded-xl" />
          <SkeletonItem className="h-16 w-full rounded-xl" />
        </div>
      </Modal>
    );
  }

  if (!prepayment) {
    return null;
  }

  const hasAdditionalInfo = Boolean(prepayment.description || prepayment.reference_number || prepayment.payment_method);

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={t('details.title')}
      icon={<Landmark className="h-4 w-4" aria-hidden="true" />}
      size="md"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={handleDelete}
            isLoading={deleteMutation.isPending}
            leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
            className="text-red-600 hover:bg-red-50 hover:text-red-700 sm:mr-auto dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
          >
            {t('actions.delete')}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('actions.close')}
          </Button>
          {onEdit && (
            <Button type="button" onClick={onEdit} leftIcon={<Pencil className="h-4 w-4" aria-hidden="true" />}>
              {t('actions.edit')}
            </Button>
          )}
        </>
      }
    >
      <div className="animate-fade-in space-y-6">
        {/* Main Info */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
              {prepayment.tax_type === 'vat' ? t('taxTypes.vat') : t('taxTypes.incomeTax')}
            </p>
            <div className="mt-2">
              <Badge variant={statusVariants[prepayment.status] || 'gray'} dot>
                {t(`status.${prepayment.status}`)}
              </Badge>
            </div>
          </div>
          <div className="shrink-0 sm:text-right">
            <p
              className={cn(
                'text-2xl font-semibold tracking-tight tabular-nums',
                prepayment.status === 'refund'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-gray-900 dark:text-white'
              )}
            >
              {formatCurrency(prepayment.amount)}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('fields.paymentDate')}: <span className="tabular-nums">{formatDate(prepayment.payment_date)}</span>
            </p>
          </div>
        </div>

        {/* Period Info */}
        <section>
          <SectionHeading icon={CalendarRange} title={t('details.periodInfo')} />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl bg-gray-50 p-4 ring-1 ring-inset ring-gray-200 sm:grid-cols-4 dark:bg-white/[0.03] dark:ring-gray-800">
            <Detail label={t('fields.periodStart')}>
              <span className="tabular-nums">{prepayment.period_start ? formatDate(prepayment.period_start) : '—'}</span>
            </Detail>
            <Detail label={t('fields.periodEnd')}>
              <span className="tabular-nums">{prepayment.period_end ? formatDate(prepayment.period_end) : '—'}</span>
            </Detail>
            <Detail label={t('fields.taxYear')}>
              <span className="tabular-nums">{prepayment.tax_year}</span>
            </Detail>
            <Detail label={t('fields.quarter')}>
              {prepayment.quarter ? t(`quarters.q${prepayment.quarter}`) : '—'}
            </Detail>
          </dl>
        </section>

        {/* Additional Details */}
        {hasAdditionalInfo && (
          <section>
            <SectionHeading icon={Info} title={t('details.additionalInfo')} />
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              {prepayment.description && (
                <Detail label={t('fields.description')} className="sm:col-span-2">
                  {prepayment.description}
                </Detail>
              )}

              {prepayment.reference_number && (
                <Detail label={t('fields.referenceNumber')}>
                  {prepayment.reference_number}
                </Detail>
              )}

              {prepayment.payment_method && (
                <Detail label={t('fields.paymentMethod')}>
                  {t(`paymentMethods.${prepayment.payment_method}`)}
                </Detail>
              )}
            </dl>
          </section>
        )}

        {/* Notes */}
        {prepayment.notes && (
          <section>
            <SectionHeading icon={StickyNote} title={t('fields.notes')} />
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              {prepayment.notes}
            </p>
          </section>
        )}

        {/* Receipt Section */}
        {prepayment.receipt_filename && (
          <section>
            <SectionHeading icon={Paperclip} title={t('fields.receipt')} />
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-800">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/20">
                <FileText className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">
                {prepayment.receipt_filename}
              </span>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setShowReceiptPreview(true)}
                  className={iconButtonClass}
                  title={t('actions.viewReceipt')}
                  aria-label={t('actions.viewReceipt')}
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={handleDownloadReceipt}
                  className={iconButtonClass}
                  title={t('actions.downloadReceipt')}
                  aria-label={t('actions.downloadReceipt')}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={handleDeleteReceipt}
                  disabled={deleteReceiptMutation.isPending}
                  className={cn(iconButtonClass, 'hover:text-red-600 dark:hover:text-red-400')}
                  title={t('actions.deleteReceipt')}
                  aria-label={t('actions.deleteReceipt')}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Receipt Preview Modal */}
      <Modal
        open={showReceiptPreview}
        onClose={() => setShowReceiptPreview(false)}
        title={prepayment.receipt_filename || t('actions.viewReceipt')}
        icon={<Eye className="h-4 w-4" aria-hidden="true" />}
        size="xl"
      >
        <div className="flex min-h-[16rem] items-center justify-center rounded-lg bg-gray-100 p-4 dark:bg-gray-950/60">
          {receiptPreviewUrl ? (
            <img
              src={receiptPreviewUrl}
              alt={t('details.receiptPreviewAlt')}
              className="max-h-[70vh] max-w-full animate-fade-in rounded object-contain"
            />
          ) : (
            <SkeletonItem className="h-64 w-full max-w-md" />
          )}
        </div>
      </Modal>
    </Modal>
  );
}
