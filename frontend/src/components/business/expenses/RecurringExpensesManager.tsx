import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/api/services/client';
import { Expense } from '@/api/types';
import { formatCurrency } from '@/utils/currency';
import { useTriggerRecurringExpenses } from '@/hooks/api/useExpenses';

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
      onSaved();
      onClose();
    } catch (error) {
      console.error('Failed to update recurring expense:', error);
      alert('Failed to update. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl bg-white dark:bg-gray-800 p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {t('recurring.editRecurrence', 'Edit Recurrence Settings')}
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('recurring.description', 'Description')}
            </label>
            <p className="text-gray-900 dark:text-white font-medium">{expense.description}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('recurring.frequency', 'Frequency')}
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="monthly">{t('recurring.monthly', 'Monthly')}</option>
              <option value="quarterly">{t('recurring.quarterly', 'Quarterly')}</option>
              <option value="yearly">{t('recurring.yearly', 'Yearly')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('recurring.startDate', 'Start Date')}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('recurring.endDate', 'End Date')}
              <span className="text-gray-500 text-xs ml-1">({t('recurring.optional', 'Optional - leave empty for indefinite')})</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-sm">
            <p className="text-blue-700 dark:text-blue-300">
              💡 {t('recurring.nextOccurrenceInfo', 'Next scheduled generation')}: {' '}
              <strong>
                {expense.next_occurrence 
                  ? new Date(expense.next_occurrence).toLocaleDateString() 
                  : t('recurring.noNextOccurrence', 'Not scheduled')}
              </strong>
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            {t('cancel', 'Cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            {isSaving ? t('saving', 'Saving...') : t('save', 'Save Changes')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RecurringExpensesManager() {
  const { t } = useTranslation('expenses');
  const [editingExpense, setEditingExpense] = useState<RecurringExpense | null>(null);
  const triggerRecurring = useTriggerRecurringExpenses();
  const queryClient = useQueryClient();

  const { data: recurringExpenses = [], isLoading, refetch } = useQuery({
    queryKey: ['recurring-expenses'],
    queryFn: fetchRecurringExpenses,
  });

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
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
            {t('recurring.ended', 'Ended')}
          </span>
        );
      }
    }
    
    if (expense.next_occurrence) {
      const nextDate = new Date(expense.next_occurrence);
      nextDate.setHours(0, 0, 0, 0);
      
      if (nextDate <= today) {
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            {t('recurring.pending', 'Pending Generation')}
          </span>
        );
      }
    }
    
    return (
      <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        {t('recurring.active', 'Active')}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            🔄 {t('recurring.title', 'Recurring Expenses')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('recurring.subtitle', 'Manage your recurring expense templates')}
          </p>
        </div>
        <button
          onClick={handleTriggerSync}
          disabled={triggerRecurring.isPending}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 border border-purple-300 dark:border-purple-700 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-50"
        >
          {triggerRecurring.isPending ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
              {t('recurring.syncing', 'Syncing...')}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {t('recurring.syncNow', 'Sync Now')}
            </>
          )}
        </button>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          💡 {t('recurring.infoText', 'Recurring expenses are automatically generated daily at 2:00 AM. Use "Sync Now" to manually generate any pending expenses.')}
        </p>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {recurringExpenses.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              {t('recurring.noRecurring', 'No recurring expenses configured')}
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              {t('recurring.createHint', 'Create a new expense and enable the "Recurring" option')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                  {t('description', 'Description')}
                </th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                  {t('recurring.frequency', 'Frequency')}
                </th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                  {t('amount', 'Amount')}
                </th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                  {t('recurring.period', 'Period')}
                </th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                  {t('recurring.nextOccurrence', 'Next')}
                </th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                  {t('recurring.generated', 'Generated')}
                </th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                  {t('status', 'Status')}
                </th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                  {t('actions', 'Actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {recurringExpenses.map((expense) => (
                <tr 
                  key={expense.id} 
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {expense.description}
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 capitalize">
                      {expense.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {getFrequencyLabel(expense.recurrence_frequency)}
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                    {formatCurrency(expense.amount, expense.currency)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {formatDate(expense.recurrence_start_date)}
                    <span className="mx-1">→</span>
                    {expense.recurrence_end_date 
                      ? formatDate(expense.recurrence_end_date)
                      : <span className="text-green-600 dark:text-green-400">∞</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {formatDate(expense.next_occurrence)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                      {expense.generated_count || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {getStatusBadge(expense)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setEditingExpense(expense)}
                      className="p-2 text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 transition-colors"
                      title={t('edit', 'Edit')}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingExpense && (
        <EditRecurringModal
          expense={editingExpense}
          isOpen={!!editingExpense}
          onClose={() => setEditingExpense(null)}
          onSaved={() => refetch()}
        />
      )}
    </div>
  );
}

export default RecurringExpensesManager;
