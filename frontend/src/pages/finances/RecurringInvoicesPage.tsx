/**
 * @fileoverview Recurring invoices (retainers) management page.
 *
 * Lists recurring-invoice schedules and lets the user create, edit, delete, and
 * manually trigger generation. Generated invoices are drafts that appear under
 * the Invoices tab for review before sending.
 *
 * @module pages/finances/RecurringInvoicesPage
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { EmptyState } from '@/components/common/EmptyState';
import { SkeletonItem } from '@/components/common/Skeleton';
import RecurringInvoiceFormModal from '@/components/business/invoices/RecurringInvoiceFormModal';
import { RowActionButton } from '@/components/business/invoices/RowActionButton';
import {
  fetchRecurringInvoices,
  createRecurringInvoice,
  updateRecurringInvoice,
  deleteRecurringInvoice,
  generateRecurringInvoiceNow,
  RecurringInvoice,
  RecurringInvoicePayload,
} from '@/api/services/recurring-invoice.service';
import { fetchClients } from '@/api/services/client.service';
import { fetchProjects } from '@/api/services/project.service';
import { getTaxRates } from '@/api/services/tax-rate.service';
import { formatCurrency } from '@/utils/currency';
import { formatDate, parseYmd } from '@/utils/date';
import { toast } from '@/lib/toast';
import { confirmDialog } from '@/lib/confirm';
import { Plus, Play, Pencil, Trash2, Repeat } from 'lucide-react';

function scheduleSubtotal(s: RecurringInvoice): number {
  return (s.line_items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
}

export default function RecurringInvoicesPage() {
  const { t } = useTranslation('invoices');
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringInvoice | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['recurring-invoices'],
    queryFn: fetchRecurringInvoices,
  });
  const { data: clients = [] } = useQuery({ queryKey: ['clients', 'all'], queryFn: () => fetchClients() });
  const { data: projects = [] } = useQuery({ queryKey: ['projects', 'all'], queryFn: () => fetchProjects() });
  const { data: taxRates = [] } = useQuery({ queryKey: ['tax-rates', 'active'], queryFn: () => getTaxRates(true) });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['recurring-invoices'] });

  const saveMutation = useMutation({
    mutationFn: async (payload: RecurringInvoicePayload) =>
      editing ? updateRecurringInvoice(editing.id, payload) : createRecurringInvoice(payload),
    onSuccess: () => {
      refresh();
      setModalOpen(false);
      setEditing(null);
      toast.success(editing ? t('recurring.messages.updated') : t('recurring.messages.created'));
    },
    onError: (e: any) => setFormError(e?.response?.data?.message || e?.message || t('recurring.messages.saveFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRecurringInvoice(id),
    onSuccess: () => { refresh(); toast.success(t('recurring.messages.deleted')); },
    onError: (e: any) => toast.error(e?.response?.data?.message || t('recurring.messages.deleteFailed')),
  });

  const generateMutation = useMutation({
    mutationFn: (id: string) => generateRecurringInvoiceNow(id),
    onSuccess: (ids) => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      if (ids.length > 0) {
        toast.success(t('recurring.messages.generated', { count: ids.length }));
      } else {
        toast.info(t('recurring.messages.nothingDue'));
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || t('recurring.messages.generateFailed')),
  });

  const openCreate = () => { setEditing(null); setFormError(null); setModalOpen(true); };
  const openEdit = (s: RecurringInvoice) => { setEditing(s); setFormError(null); setModalOpen(true); };

  const handleDelete = async (s: RecurringInvoice) => {
    const confirmed = await confirmDialog({
      title: t('recurring.messages.deleteConfirmTitle'),
      message: t('recurring.messages.deleteConfirm', { title: s.title }),
      tone: 'danger',
    });
    if (confirmed) {
      deleteMutation.mutate(s.id);
    }
  };

  const sorted = useMemo(
    () => [...schedules].sort((a, b) => Number(b.is_active) - Number(a.is_active)),
    [schedules]
  );

  const frequencyLabel = (frequency: string) =>
    t(`recurring.frequency.${frequency}`, { defaultValue: frequency });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="section-title">{t('recurring.title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('recurring.subtitle')}
          </p>
        </div>
        <Button type="button" onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>{t('recurring.newSchedule')}</Button>
      </div>

      {isLoading ? (
        <div className="surface overflow-hidden" aria-busy="true">
          <div className="divide-y divide-gray-100 dark:divide-gray-800/70">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex items-center gap-6 px-5 py-4">
                <SkeletonItem className="h-4 w-40" />
                <SkeletonItem className="hidden h-4 w-28 sm:block" />
                <SkeletonItem className="hidden h-4 w-20 md:block" />
                <SkeletonItem className="ml-auto h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          bordered
          icon={Repeat}
          title={t('recurring.empty.title')}
          description={t('recurring.empty.message')}
          action={
            <Button type="button" onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
              {t('recurring.newSchedule')}
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-soft dark:border-gray-800 dark:bg-gray-900 dark:shadow-edge">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
              <thead className="bg-gray-50/80 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-gray-500 dark:bg-white/[0.02] dark:text-gray-400">
                <tr className="text-left">
                  <th className="px-4 py-2.5 first:pl-5">{t('recurring.table.title')}</th>
                  <th className="px-4 py-2.5">{t('recurring.table.client')}</th>
                  <th className="px-4 py-2.5">{t('recurring.table.frequency')}</th>
                  <th className="px-4 py-2.5">{t('recurring.table.nextInvoice')}</th>
                  <th className="px-4 py-2.5 text-right">{t('recurring.table.amount')}</th>
                  <th className="px-4 py-2.5">{t('recurring.table.status')}</th>
                  <th className="px-4 py-2.5 pr-5 text-right"><span className="sr-only">{t('recurring.table.actions')}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
                {sorted.map((s) => (
                  <tr key={s.id} className="text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-3 pl-5 font-medium text-gray-900 dark:text-white">{s.title}</td>
                    <td className="px-4 py-3">{s.client_name || '—'}</td>
                    <td className="px-4 py-3">{frequencyLabel(s.frequency)}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{s.is_active && s.next_occurrence ? formatDate(parseYmd(s.next_occurrence)) : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-gray-900 dark:text-white">{formatCurrency(scheduleSubtotal(s), s.currency)}</td>
                    <td className="px-4 py-3">
                      {s.is_active
                        ? <Badge variant="green" size="sm" dot>{t('recurring.status.active')}</Badge>
                        : <Badge variant="gray" size="sm">{t('recurring.status.paused')}</Badge>}
                    </td>
                    <td className="px-4 py-3 pr-5">
                      <div className="flex items-center justify-end gap-0.5">
                        <RowActionButton
                          label={t('recurring.actions.generateNow')}
                          tone="success"
                          onClick={() => generateMutation.mutate(s.id)}
                          disabled={!s.is_active || generateMutation.isPending}
                        >
                          <Play className="h-4 w-4" aria-hidden="true" />
                        </RowActionButton>
                        <RowActionButton label={t('recurring.actions.edit')} onClick={() => openEdit(s)}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </RowActionButton>
                        <RowActionButton label={t('recurring.actions.delete')} tone="danger" onClick={() => void handleDelete(s)}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </RowActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <RecurringInvoiceFormModal
        open={modalOpen}
        mode={editing ? 'edit' : 'create'}
        initial={editing}
        clients={clients}
        projects={projects}
        taxRates={taxRates}
        onSave={async (payload) => { setFormError(null); await saveMutation.mutateAsync(payload).catch(() => {}); }}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        isSaving={saveMutation.isPending}
        error={formError}
      />
    </div>
  );
}
