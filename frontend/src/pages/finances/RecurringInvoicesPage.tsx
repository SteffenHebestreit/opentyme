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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/common/Button';
import { Alert } from '@/components/common/Alert';
import { Badge } from '@/components/common/Badge';
import RecurringInvoiceFormModal from '@/components/business/invoices/RecurringInvoiceFormModal';
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
import { Plus, Play, Pencil, Trash2 } from 'lucide-react';

const frequencyLabel: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

function scheduleSubtotal(s: RecurringInvoice): number {
  return (s.line_items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
}

export default function RecurringInvoicesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringInvoice | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
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
      setBanner({ type: 'success', text: editing ? 'Schedule updated.' : 'Schedule created.' });
    },
    onError: (e: any) => setFormError(e?.response?.data?.message || e?.message || 'Failed to save schedule.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRecurringInvoice(id),
    onSuccess: () => { refresh(); setBanner({ type: 'success', text: 'Schedule deleted.' }); },
    onError: (e: any) => setBanner({ type: 'error', text: e?.response?.data?.message || 'Failed to delete schedule.' }),
  });

  const generateMutation = useMutation({
    mutationFn: (id: string) => generateRecurringInvoiceNow(id),
    onSuccess: (ids) => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setBanner({
        type: 'success',
        text: ids.length > 0 ? `Generated ${ids.length} draft invoice(s) — see the Invoices tab.` : 'No invoices due yet.',
      });
    },
    onError: (e: any) => setBanner({ type: 'error', text: e?.response?.data?.message || 'Failed to generate invoices.' }),
  });

  const openCreate = () => { setEditing(null); setFormError(null); setModalOpen(true); };
  const openEdit = (s: RecurringInvoice) => { setEditing(s); setFormError(null); setModalOpen(true); };

  const handleDelete = (s: RecurringInvoice) => {
    if (window.confirm(`Delete the recurring schedule "${s.title}"? Already-generated invoices are kept.`)) {
      deleteMutation.mutate(s.id);
    }
  };

  const sorted = useMemo(
    () => [...schedules].sort((a, b) => Number(b.is_active) - Number(a.is_active)),
    [schedules]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recurring invoices</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Automatically generate draft invoices for retainers. Drafts appear under Invoices for review.
          </p>
        </div>
        <Button onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>New schedule</Button>
      </div>

      {banner && <Alert type={banner.type} message={banner.text} />}

      {isLoading ? (
        <div className="py-10 text-center text-gray-500">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-gray-500 dark:border-gray-700">
          No recurring invoices yet. Create one to bill retainers automatically.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Frequency</th>
                <th className="px-4 py-3">Next invoice</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {sorted.map((s) => (
                <tr key={s.id} className="text-gray-700 dark:text-gray-300">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{s.title}</td>
                  <td className="px-4 py-3">{s.client_name || '—'}</td>
                  <td className="px-4 py-3">{frequencyLabel[s.frequency] || s.frequency}</td>
                  <td className="px-4 py-3">{s.is_active ? (s.next_occurrence || '—') : '—'}</td>
                  <td className="px-4 py-3 text-right">{scheduleSubtotal(s).toFixed(2)} {s.currency}</td>
                  <td className="px-4 py-3">
                    {s.is_active ? <Badge variant="green" size="sm" dot>Active</Badge> : <Badge variant="gray" size="sm">Paused</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-green-600 disabled:opacity-40 dark:hover:bg-gray-700"
                        title="Generate due invoices now"
                        onClick={() => generateMutation.mutate(s.id)}
                        disabled={!s.is_active || generateMutation.isPending}
                      >
                        <Play className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-purple-600 dark:hover:bg-gray-700"
                        title="Edit"
                        onClick={() => openEdit(s)}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-700"
                        title="Delete"
                        onClick={() => handleDelete(s)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
