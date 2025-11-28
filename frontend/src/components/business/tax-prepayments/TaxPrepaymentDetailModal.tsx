import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaxPrepayment, useDeleteTaxPrepayment, useDeleteReceipt } from '@/hooks/api/useTaxPrepayments';
import { formatCurrency } from '@/utils/currency';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/common/Button';
import { Download, Trash2, Edit2, FileText, Eye, X } from 'lucide-react';
import api from '@/api/services/client';

interface TaxPrepaymentDetailModalProps {
  prepaymentId: string;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
}

export function TaxPrepaymentDetailModal({
  prepaymentId,
  isOpen,
  onClose,
  onEdit,
}: TaxPrepaymentDetailModalProps) {
  const { t } = useTranslation('tax-prepayments');
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
    if (!confirm(t('messages.confirmDelete'))) return;

    try {
      await deleteMutation.mutateAsync(prepaymentId);
      onClose();
    } catch (error) {
      console.error('Failed to delete tax prepayment:', error);
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
    }
  };

  const handleDeleteReceipt = async () => {
    if (!confirm(t('messages.confirmDeleteReceipt'))) return;

    try {
      await deleteReceiptMutation.mutateAsync(prepaymentId);
    } catch (error) {
      console.error('Failed to delete receipt:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getStatusBadgeColor = (status: string) => {
    const colors = {
      paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      planned: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  };

  if (isLoading) {
    return (
      <Modal open={isOpen} onClose={onClose} title={t('details.title')} size="lg">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
        </div>
      </Modal>
    );
  }

  if (!prepayment) {
    return null;
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={t('details.title')}
      size="lg"
      footer={
        <div className="flex justify-between w-full">
          <Button type="button" variant="outline" onClick={handleDelete} className="text-red-600 hover:text-red-700">
            <Trash2 className="w-4 h-4 mr-2" />
            {t('actions.delete')}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('actions.close')}
            </Button>
            {onEdit && (
              <Button type="button" onClick={onEdit}>
                <Edit2 className="w-4 h-4 mr-2" />
                {t('actions.edit')}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Main Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t('fields.taxType')}
            </label>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
              {prepayment.tax_type === 'vat' ? t('taxTypes.vat') : t('taxTypes.incomeTax')}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t('fields.status')}
            </label>
            <div className="mt-1">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${getStatusBadgeColor(prepayment.status)}`}>
                {t(`status.${prepayment.status}`)}
              </span>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t('fields.amount')}
            </label>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(prepayment.amount)}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t('fields.paymentDate')}
            </label>
            <p className="mt-1 text-base text-gray-900 dark:text-white">
              {formatDate(prepayment.payment_date)}
            </p>
          </div>
        </div>

        {/* Period Info */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
            {t('details.periodInfo')}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t('fields.periodStart')}
              </label>
              <p className="mt-1 text-base text-gray-900 dark:text-white">
                {formatDate(prepayment.period_start)}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t('fields.periodEnd')}
              </label>
              <p className="mt-1 text-base text-gray-900 dark:text-white">
                {formatDate(prepayment.period_end)}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t('fields.taxYear')}
              </label>
              <p className="mt-1 text-base text-gray-900 dark:text-white">
                {prepayment.tax_year}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t('fields.quarter')}
              </label>
              <p className="mt-1 text-base text-gray-900 dark:text-white">
                {prepayment.quarter ? t(`quarters.q${prepayment.quarter}`) : '-'}
              </p>
            </div>
          </div>
        </div>

        {/* Additional Details */}
        {(prepayment.description || prepayment.reference_number || prepayment.payment_method) && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
              {t('details.additionalInfo')}
            </h3>
            <div className="space-y-3">
              {prepayment.description && (
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {t('fields.description')}
                  </label>
                  <p className="mt-1 text-base text-gray-900 dark:text-white">
                    {prepayment.description}
                  </p>
                </div>
              )}

              {prepayment.reference_number && (
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {t('fields.referenceNumber')}
                  </label>
                  <p className="mt-1 text-base text-gray-900 dark:text-white">
                    {prepayment.reference_number}
                  </p>
                </div>
              )}

              {prepayment.payment_method && (
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {t('fields.paymentMethod')}
                  </label>
                  <p className="mt-1 text-base text-gray-900 dark:text-white">
                    {t(`paymentMethods.${prepayment.payment_method}`)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        {prepayment.notes && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t('fields.notes')}
            </label>
            <p className="mt-1 text-base text-gray-900 dark:text-white whitespace-pre-wrap">
              {prepayment.notes}
            </p>
          </div>
        )}

        {/* Receipt Section */}
        {prepayment.receipt_filename && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 block">
              {t('fields.receipt')}
            </label>
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {prepayment.receipt_filename}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowReceiptPreview(true)}
                  className="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                  title={t('actions.viewReceipt')}
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDownloadReceipt}
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  title={t('actions.downloadReceipt')}
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDeleteReceipt}
                  className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                  title={t('actions.deleteReceipt')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Receipt Preview Modal */}
      {showReceiptPreview && receiptPreviewUrl && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60]" onClick={() => setShowReceiptPreview(false)}>
          <div className="relative max-w-4xl max-h-[90vh] w-full mx-4">
            <button
              onClick={() => setShowReceiptPreview(false)}
              className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/70"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={receiptPreviewUrl}
              alt="Receipt preview"
              className="max-w-full max-h-[90vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
