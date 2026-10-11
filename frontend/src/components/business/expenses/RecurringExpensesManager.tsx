import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, Pencil, RefreshCw, Repeat } from 'lucide-react';
import api from '@/api/services/client';
import { Expense } from '@/api/types';
import { formatCurrency } from '@/utils/currency';
import { useTriggerRecurringExpenses } from '@/hooks/api/useExpenses';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { EmptyState } from '@/components/common/EmptyState';
import { SkeletonItem } from '@/components/common/Skeleton';
import { fieldClasses, fieldLabelClass } from '@/components/forms/fieldStyles';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/cn';
import { expenseCategoryLabel } from './expenseCategories';

interface RecurringExpense extends Expense {
  generated_count?: number;
}

/**
 * Fetch all recurring expense templates (parent expenses)
 */
const fetchRecurringExpenses = async (): Promise<RecurringExpense[]> => {
  // Fetch all expenses with is_recurring=true and no parent
  const response = await api.get<{ expenses: Expense[] }>('/expenses?limit=0');
  const allExpenses = response.data.expenses;

  // Filter to only recurring templates (is_recurring=true and no parent_expense_id)
  const templates = allExpenses.filter(e => e.is_recurring && !e.parent_expense_id);

  // Count generated expenses for each template
  const templatesWithCounts = templates.map(template => {
    const generatedCount = allExpenses.filter(e => e.parent_expense_id === template.id).length;
    return { ...template, generated_count: generatedCount };
  });

  return templatesWithCounts;
};

interface EditRecurringModalProps {
  expense: RecurringExpense;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function EditRecurringModal({ expense, isOpen, onClose, onSaved }: EditRecurringModalProps) {
  const { t } = useTranslation('expenses');
  const queryClient = useQueryClient();

  const [frequency, setFrequency] = useState(expense.recurrence_frequency || 'monthly');
  const [startDate, setStartDate] = useState(
    expense.recurrence_start_date ? expense.recurrence_start_date.split('T')[0] : ''
  );
  const [endDate, setEndDate] = useState(
    expense.recurrence_end_date ? expense.recurrence_end_date.split('T')[0] : ''
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.put(`/expenses/${expense.id}`, {
        recurrence_frequency: frequency,
        recurrence_start_date: startDate || null,
        recurrence_end_date: endDate || null,
      });
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success(t('recurring.saved'));
      onSaved();
      onClose();
    } catch (error) {
      console.error('Failed to update recurring expense:', error);
      toast.error(t('recurring.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="sm"
      icon={<Repeat className="h-4 w-4" aria-hidden="true" />}
      title={t('recurring.editRecurrence', 'Edit Recurrence Settings')}
      description={expense.description}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={handleSave} isLoading={isSaving}>
            {isSaving ? t('saving', 'Saving...') : t('save', 'Save Changes')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="recurring-frequency" className={fieldLabelClass()}>
            {t('recurring.frequency', 'Frequency')}
          </label>
          <select
            id="recurring-frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className={fieldClasses()}
          >
            <option value="monthly">{t('recurring.monthly', 'Monthly')}</option>
            <option value="quarterly">{t('recurring.quarterly', 'Quarterly')}</option>
            <option value="yearly">{t('recurring.yearly', 'Yearly')}</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="recurring-start" className={fieldLabelClass()}>
              {t('recurring.startDate', 'Start Date')}
            </label>
            <input
              id="recurring-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={fieldClasses()}
            />
          </div>

          <div>
            <label htmlFor="recurring-end" className={fieldLabelClass()}>
              {t('recurring.endDateShort')}
            </label>
            <input
              id="recurring-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={fieldClasses()}
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              {t('recurring.optional', 'Optional - leave empty for indefinite')}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg bg-gray-50 px-3.5 py-3 text-sm ring-1 ring-inset ring-gray-200 dark:bg-white/[0.03] dark:ring-gray-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
          <p className="text-gray-600 dark:text-gray-300">
            {t('recurring.nextOccurrenceInfo', 'Next scheduled generation')}:{' '}
            <strong className="font-medium tabular-nums text-gray-900 dark:text-white">
              {expense.next_occurrence
                ? new Date(expense.next_occurrence).toLocaleDateString()
                : t('recurring.noNextOccurrence', 'Not scheduled')}
            </strong>
          </p>
        </div>
      </div>
    </Modal>
  );
}

export function RecurringExpensesManager() {
  const { t } = useTranslation('expenses');
  // The edit dialog stays mounted while it closes so it can animate out;
  // the session counter gives every opening fresh form state.
  const [editingExpense, setEditingExpense] = useState<RecurringExpense | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSession, setEditSession] = useState(0);
  const triggerRecurring = useTriggerRecurringExpenses();

  const { data: recurringExpenses = [], isLoading, refetch } = useQuery({
    queryKey: ['recurring-expenses'],
    queryFn: fetchRecurringExpenses,
  });

  const openEditor = (expense: RecurringExpense) => {
    setEditingExpense(expense);
    setEditSession((session) => session + 1);
    setEditOpen(true);
  };

  const handleTriggerSync = async () => {
    try {
      await triggerRecurring.mutateAsync();
      refetch();
    } catch (error) {
      console.error('Failed to trigger recurring expenses:', error);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  const getFrequencyLabel = (freq: string | null | undefined) => {
    switch (freq) {
      case 'monthly': return t('recurring.monthly', 'Monthly');
      case 'quarterly': return t('recurring.quarterly', 'Quarterly');
      case 'yearly': return t('recurring.yearly', 'Yearly');
      default: return freq || '-';
    }
  };

  const getStatusBadge = (expense: RecurringExpense) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (expense.recurrence_end_date) {
      const endDate = new Date(expense.recurrence_end_date);
      endDate.setHours(0, 0, 0, 0);

      if (endDate < today) {
        return <Badge variant="gray">{t('recurring.ended', 'Ended')}</Badge>;
      }
    }

    if (expense.next_occurrence) {
      const nextDate = new Date(expense.next_occurrence);
      nextDate.setHours(0, 0, 0, 0);

      if (nextDate <= today) {
        return <Badge variant="amber" dot>{t('recurring.pending', 'Pending Generation')}</Badge>;
      }
    }

    return <Badge variant="green" dot>{t('recurring.active', 'Active')}</Badge>;
  };

  const thClass = 'px-4 py-2.5 first:pl-5 last:pr-5';
  const tdClass = 'px-4 py-3 align-middle first:pl-5 last:pr-5';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h3 className="section-title">{t('recurring.title', 'Recurring Expenses')}</h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {t('recurring.subtitle', 'Manage your recurring expense templates')}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={handleTriggerSync}
          disabled={triggerRecurring.isPending}
          leftIcon={
            <RefreshCw className={cn('h-4 w-4', triggerRecurring.isPending && 'animate-spin')} aria-hidden="true" />
          }
        >
          {triggerRecurring.isPending ? t('recurring.syncing', 'Syncing...') : t('recurring.syncNow', 'Sync Now')}
        </Button>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" aria-hidden="true" />
        <p>
          {t('recurring.infoText', 'Recurring expenses are automatically generated daily at 2:00 AM. Use "Sync Now" to manually generate any pending expenses.')}
        </p>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="surface divide-y divide-gray-100 dark:divide-gray-800" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <SkeletonItem className="h-4 flex-1" />
              <SkeletonItem className="h-4 w-20" />
              <SkeletonItem className="h-4 w-24" />
              <SkeletonItem className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : recurringExpenses.length === 0 ? (
        <EmptyState
          bordered
          icon={Repeat}
          title={t('recurring.noRecurring', 'No recurring expenses configured')}
          description={t('recurring.createHint', 'Create a new expense and enable the "Recurring" option')}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-soft dark:border-gray-800 dark:bg-gray-900 dark:shadow-none">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50/80 text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-white/[0.02] dark:text-gray-400">
                <tr>
                  <th className={thClass}>{t('table.description', 'Description')}</th>
                  <th className={thClass}>{t('recurring.frequency', 'Frequency')}</th>
                  <th className={cn(thClass, 'text-right')}>{t('table.amount', 'Amount')}</th>
                  <th className={thClass}>{t('recurring.period', 'Period')}</th>
                  <th className={thClass}>{t('recurring.nextOccurrence', 'Next')}</th>
                  <th className={cn(thClass, 'text-center')}>{t('recurring.generated', 'Generated')}</th>
                  <th className={thClass}>{t('fields.status', 'Status')}</th>
                  <th className={thClass}>
                    <span className="sr-only">{t('table.actions', 'Actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/70">
                {recurringExpenses.map((expense) => (
                  <tr
                    key={expense.id}
                    className="transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                  >
                    <td className={tdClass}>
                      <span className="block font-medium text-gray-900 dark:text-white">
                        {expense.description}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {expenseCategoryLabel(t, expense.category)}
                      </span>
                    </td>
                    <td className={cn(tdClass, 'text-gray-700 dark:text-gray-300')}>
                      {getFrequencyLabel(expense.recurrence_frequency)}
                    </td>
                    <td className={cn(tdClass, 'whitespace-nowrap text-right font-medium tabular-nums text-gray-900 dark:text-white')}>
                      {formatCurrency(expense.amount, expense.currency)}
                    </td>
                    <td className={cn(tdClass, 'whitespace-nowrap tabular-nums text-gray-600 dark:text-gray-400')}>
                      {formatDate(expense.recurrence_start_date)}
                      <span className="mx-1.5 text-gray-400 dark:text-gray-500" aria-hidden="true">→</span>
                      {expense.recurrence_end_date
                        ? formatDate(expense.recurrence_end_date)
                        : (
                          <span className="text-emerald-600 dark:text-emerald-400" title={t('recurring.indefinite')}>
                            ∞
                          </span>
                        )}
                    </td>
                    <td className={cn(tdClass, 'whitespace-nowrap tabular-nums text-gray-600 dark:text-gray-400')}>
                      {formatDate(expense.next_occurrence)}
                    </td>
                    <td className={cn(tdClass, 'text-center')}>
                      <Badge variant="purple" size="sm">
                        <span className="tabular-nums">{expense.generated_count || 0}</span>
                      </Badge>
                    </td>
                    <td className={tdClass}>
                      {getStatusBadge(expense)}
                    </td>
                    <td className={cn(tdClass, 'text-right')}>
                      <button
                        type="button"
                        onClick={() => openEditor(expense)}
                        className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-purple-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-purple-300"
                        title={t('recurring.editRecurrence', 'Edit Recurrence Settings')}
                        aria-label={t('recurring.editRecurrence', 'Edit Recurrence Settings')}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingExpense && (
        <EditRecurringModal
          key={editSession}
          expense={editingExpense}
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={() => refetch()}
        />
      )}
    </div>
  );
}

export default RecurringExpensesManager;
