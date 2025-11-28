import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateExpense } from '@/hooks/api/useExpenses';
import { useProjects } from '@/hooks/api/useProjects';
import { ExpenseCategory } from '@/api/types';
import { Input, CustomSelect, Textarea } from '@/components/forms';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/common/Button';
import { useUploadReceipt } from '@/hooks/api/useExpenses';
import { analyzeReceipt } from '@/api/services/expense.service';
import { DepreciationSettings } from '@/components/business/expenses/DepreciationSettings';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExpenseAdded: () => void;
}

export function AddExpenseModal({ isOpen, onClose, onExpenseAdded }: AddExpenseModalProps) {
  const { t } = useTranslation('expenses');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [category, setCategory] = useState<string>('software');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [projectId, setProjectId] = useState<string>('');
  const [isBillable, setIsBillable] = useState(false);
  const [isReimbursable, setIsReimbursable] = useState(false);
  const [notes, setNotes] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  
  // Recurring expense fields
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState('monthly');
  const [recurrenceStartDate, setRecurrenceStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');

  // Depreciation fields
  const [depreciationType, setDepreciationType] = useState<'none' | 'immediate' | 'partial' | null>('none');
  const [depreciationYears, setDepreciationYears] = useState<number | null>(null);
  const [depreciationMethod, setDepreciationMethod] = useState<'linear' | 'declining' | null>('linear');
  const [depreciationCategory, setDepreciationCategory] = useState<string | null>(null);

  // Calculate tax breakdown
  const totalAmount = parseFloat(amount) || 0;
  const taxRatePercent = parseFloat(taxRate) || 0;
  const taxMultiplier = 1 + (taxRatePercent / 100);
  const netAmount = totalAmount / taxMultiplier;
  const taxAmount = totalAmount - netAmount;

  const createExpense = useCreateExpense();
  const uploadReceipt = useUploadReceipt();
  const { data: projects = [] } = useProjects();

  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      setDescription('');
      setAmount('');
      setTaxRate('0');
      setCategory('software');
      setExpenseDate(new Date().toISOString().split('T')[0]);
      setProjectId('');
      setIsBillable(false);
      setIsReimbursable(false);
      setNotes('');
      setCurrency('EUR');
      setReceiptFile(null);
      setIsRecurring(false);
      setRecurrenceFrequency('monthly');
      setRecurrenceStartDate(new Date().toISOString().split('T')[0]);
      setRecurrenceEndDate('');
      setDepreciationType('none');
      setDepreciationYears(null);
      setDepreciationMethod('linear');
      setDepreciationCategory(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // First create the expense
      const expenseData: any = {
        description,
        amount: parseFloat(amount),
        net_amount: parseFloat(netAmount.toFixed(2)),
        tax_rate: parseFloat(taxRate) / 100, // Convert percentage to decimal (19 -> 0.19)
        tax_amount: parseFloat(taxAmount.toFixed(2)),
        category: category as ExpenseCategory,
        expense_date: expenseDate,
        project_id: projectId || null,
        is_billable: isBillable,
        is_reimbursable: isReimbursable,
        notes: notes || null,
        currency,
      };

      // Only add recurring fields if recurring is enabled
      if (isRecurring) {
        expenseData.is_recurring = true;
        expenseData.recurrence_frequency = recurrenceFrequency;
        expenseData.recurrence_start_date = recurrenceStartDate;
        expenseData.recurrence_end_date = recurrenceEndDate || null;
      }

      // Add depreciation fields if not 'none'
      if (depreciationType && depreciationType !== 'none') {
        expenseData.depreciation_type = depreciationType;
        expenseData.depreciation_method = depreciationMethod;
        expenseData.useful_life_category = depreciationCategory; // Backend expects useful_life_category
        if (depreciationType === 'partial' && depreciationYears) {
          expenseData.depreciation_years = depreciationYears;
        }
      }

      const newExpense = await createExpense.mutateAsync(expenseData);

      // Then upload receipt if provided
      if (receiptFile && newExpense.id) {
        await uploadReceipt.mutateAsync({
          expenseId: newExpense.id,
          file: receiptFile,
        });
      }

      onExpenseAdded();
      onClose();
    } catch (error) {
      console.error('Failed to create expense:', error);
      // Log the full error details
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        console.error('Response data:', axiosError.response?.data);
        console.error('Response status:', axiosError.response?.status);
      }
    }
  };

  const handleAnalyzeReceipt = async () => {
    if (!receiptFile) {
      setAnalysisMessage('Please select a PDF file first');
      return;
    }

    if (!receiptFile.type.includes('pdf')) {
      setAnalysisMessage('Only PDF files can be analyzed');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisMessage(null);

    try {
      const result = await analyzeReceipt(receiptFile);

      if (result.success && result.data) {
        // Pre-fill form with extracted data
        if (result.data.amount) setAmount(result.data.amount.toString());
        if (result.data.date) setExpenseDate(result.data.date);
        if (result.data.vendor) setDescription(result.data.vendor);
        if (result.data.category) setCategory(result.data.category);
        if (result.data.description && !description) setNotes(result.data.description);
        if (result.data.currency) setCurrency(result.data.currency);
        if (result.data.tax_rate) setTaxRate((result.data.tax_rate * 100).toString());

        const confidence = result.data.confidence || 0;
        setAnalysisMessage(
          `✓ Analysis complete! Confidence: ${confidence}%. Please review and adjust the extracted data.`
        );
      } else {
        setAnalysisMessage(result.message || 'Analysis failed. Please fill in the form manually.');
      }
    } catch (error: any) {
      console.error('Failed to analyze receipt:', error);
      setAnalysisMessage(`✗ Analysis failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formId = 'add-expense-form';

  const categoryOptions = [
    // IT & Digital Equipment
    { value: 'computer', label: t('categories.computer', 'Computer/Laptop/Tablet') },
    { value: 'software', label: t('categories.software', 'Software & Licenses') },
    { value: 'peripherals', label: t('categories.peripherals', 'Peripherals') },
    { value: 'storage', label: t('categories.storage', 'Storage Devices') },
    { value: 'display', label: t('categories.display', 'Monitor/Display') },
    { value: 'printer', label: t('categories.printer', 'Printer/Scanner') },
    
    // Office
    { value: 'office_furniture', label: t('categories.office_furniture', 'Office Furniture') },
    { value: 'office_equipment', label: t('categories.office_equipment', 'Office Equipment') },
    { value: 'office_supplies', label: t('categories.office_supplies', 'Office Supplies') },
    
    // Vehicles
    { value: 'vehicle_car', label: t('categories.vehicle_car', 'Car/Vehicle') },
    { value: 'vehicle_motorcycle', label: t('categories.vehicle_motorcycle', 'Motorcycle/E-bike') },
    
    // Tools
    { value: 'camera', label: t('categories.camera', 'Camera Equipment') },
    { value: 'tools', label: t('categories.tools', 'Tools/Equipment') },
    { value: 'machinery', label: t('categories.machinery', 'Machinery') },
    
    // Services & Operating Expenses
    { value: 'insurance', label: t('categories.insurance', 'Insurance') },
    { value: 'professional_services', label: t('categories.professional_services', 'Professional Services') },
    { value: 'marketing', label: t('categories.marketing', 'Marketing') },
    { value: 'utilities', label: t('categories.utilities', 'Utilities') },
    { value: 'travel', label: t('categories.travel', 'Travel') },
    { value: 'meals', label: t('categories.meals', 'Meals') },
    { value: 'training', label: t('categories.training', 'Training') },
    { value: 'rent', label: t('categories.rent', 'Rent') },
    { value: 'telecommunications', label: t('categories.telecommunications', 'Phone/Internet') },
    
    { value: 'other', label: t('categories.other', 'Other') },
  ];

  const projectOptions = [
    { value: '', label: t('noProject') },
    ...projects.map((p) => ({
      value: p.id,
      label: p.name,
    })),
  ];

  const currencyOptions = [
    { value: 'EUR', label: 'EUR (€)' },
    { value: 'USD', label: 'USD ($)' },
    { value: 'GBP', label: 'GBP (£)' },
  ];

  const taxRateOptions = [
    { value: '0', label: t('tax.noTax') + ' (0%)' },
    { value: '7', label: t('tax.reducedRate') + ' (7%)' },
    { value: '19', label: t('tax.standardRate') + ' (19%)' },
  ];

  const getCurrencySymbol = () => {
    switch (currency) {
      case 'USD': return '$';
      case 'GBP': return '£';
      case 'EUR':
      default: return '€';
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={t('add')}
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={createExpense.isPending}>
            {createExpense.isPending ? t('adding') : t('addExpense')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
                {/* Description */}
                <Input
                  label={t('fields.description')}
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('fields.descriptionPlaceholder')}
                  required
                />

                {/* Amount and Currency */}
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label={t('fields.amount')}
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                  <CustomSelect
                    label={t('fields.currency')}
                    value={currency}
                    onChange={setCurrency}
                    options={currencyOptions}
                  />
                </div>

                {/* Tax Rate */}
                <CustomSelect
                  label={t('tax.taxRate')}
                  value={taxRate}
                  onChange={setTaxRate}
                  options={taxRateOptions}
                />

                {/* Tax Breakdown Display */}
                {totalAmount > 0 && (
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4 border border-gray-200 dark:border-gray-700">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      {t('tax.breakdown')}
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">{t('tax.netAmount')}</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {netAmount.toFixed(2)} {getCurrencySymbol()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          {t('tax.taxAmount')} ({taxRatePercent}%)
                        </span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {taxAmount.toFixed(2)} {getCurrencySymbol()}
                        </span>
                      </div>
                      <div className="border-t border-gray-300 dark:border-gray-600 pt-2 mt-2"></div>
                      <div className="flex justify-between">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">{t('tax.total')}</span>
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                          {totalAmount.toFixed(2)} {getCurrencySymbol()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Category and Date */}
                <div className="grid grid-cols-2 gap-4">
                  <CustomSelect
                    label={t('fields.category')}
                    value={category}
                    onChange={setCategory}
                    options={categoryOptions}
                  />
                  <Input
                    label={t('fields.date')}
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    required
                  />
                </div>

                {/* Project */}
                <CustomSelect
                  label={t('fields.project')}
                  value={projectId}
                  onChange={setProjectId}
                  options={projectOptions}
                />

                {/* Checkboxes */}
                <div className="flex gap-6">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={isBillable}
                      onChange={(e) => setIsBillable(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                      {t('billableToClient')}
                    </span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={isReimbursable}
                      onChange={(e) => setIsReimbursable(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                      {t('fields.isReimbursable')}
                    </span>
                  </label>
                </div>

                {/* Recurring Expense Section */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <label className="flex items-center mb-4">
                    <input
                      type="checkbox"
                      checked={isRecurring}
                      onChange={(e) => setIsRecurring(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700"
                    />
                    <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('recurring.isRecurring', 'Recurring Expense')}
                    </span>
                  </label>

                  {isRecurring && (
                    <div className="space-y-4 pl-6 border-l-2 border-purple-200 dark:border-purple-800">
                      {/* Frequency */}
                      <CustomSelect
                        label={t('recurring.frequency', 'Frequency')}
                        value={recurrenceFrequency}
                        onChange={setRecurrenceFrequency}
                        options={[
                          { value: 'monthly', label: t('recurring.monthly', 'Monthly') },
                          { value: 'quarterly', label: t('recurring.quarterly', 'Quarterly') },
                          { value: 'yearly', label: t('recurring.yearly', 'Yearly') },
                        ]}
                      />

                      {/* Start and End Dates */}
                      <div className="grid grid-cols-2 gap-4">
                        <Input
                          label={t('recurring.startDate', 'Start Date')}
                          type="date"
                          value={recurrenceStartDate}
                          onChange={(e) => setRecurrenceStartDate(e.target.value)}
                          required
                        />
                        <Input
                          label={t('recurring.endDate', 'End Date (Optional)')}
                          type="date"
                          value={recurrenceEndDate}
                          onChange={(e) => setRecurrenceEndDate(e.target.value)}
                          min={recurrenceStartDate}
                        />
                      </div>

                      {/* Info Box */}
                      <div className="rounded-lg bg-purple-50 dark:bg-purple-900/20 p-3 border border-purple-200 dark:border-purple-800">
                        <p className="text-xs text-purple-800 dark:text-purple-300">
                          💡 {t('recurring.info', 'This expense will be automatically generated based on the selected frequency. The system runs daily at 2 AM to create new expense entries.')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Depreciation Settings */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <DepreciationSettings
                    depreciationType={depreciationType}
                    depreciationYears={depreciationYears}
                    depreciationMethod={depreciationMethod}
                    onChange={(field, value) => {
                      if (field === 'depreciation_type') {
                        setDepreciationType(value);
                      } else if (field === 'depreciation_years') {
                        setDepreciationYears(value);
                      } else if (field === 'depreciation_method') {
                        setDepreciationMethod(value);
                      }
                    }}
                  />
                </div>

                {/* Notes */}
                <Textarea
                  label={t('fields.notes')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('notesPlaceholder')}
                  rows={3}
                />

                {/* Receipt Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('fields.receipt')}
                  </label>
                  <div className="space-y-2">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                      className="block w-full text-sm text-gray-900 dark:text-gray-100 
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-md file:border-0
                                file:text-sm file:font-medium
                                file:bg-purple-50 file:text-purple-700
                                hover:file:bg-purple-100
                                dark:file:bg-purple-900/30 dark:file:text-purple-400
                                dark:hover:file:bg-purple-900/50
                                cursor-pointer"
                    />
                    {receiptFile && receiptFile.type.includes('pdf') && (
                      <button
                        type="button"
                        onClick={handleAnalyzeReceipt}
                        disabled={isAnalyzing}
                        className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 
                                   rounded-lg hover:from-purple-700 hover:to-indigo-700 
                                   disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed
                                   transition-all duration-200 shadow-sm hover:shadow-md
                                   flex items-center gap-2"
                      >
                        {isAnalyzing ? (
                          <>
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            🤖 Analyze Receipt with AI
                          </>
                        )}
                      </button>
                    )}
                    {analysisMessage && (
                      <p className={`text-sm ${analysisMessage.startsWith('✓') ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                        {analysisMessage}
                      </p>
                    )}
                    {receiptFile && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t('receiptSelected')}:{' '}
                        <button
                          type="button"
                          onClick={() => {
                            const url = URL.createObjectURL(receiptFile);
                            window.open(url, '_blank');
                          }}
                          className="text-purple-600 dark:text-purple-400 hover:underline cursor-pointer font-medium"
                        >
                          {receiptFile.name}
                        </button>
                        {' '}({(receiptFile.size / 1024).toFixed(2)} KB)
                      </p>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('receiptMaxSize')}
                    </p>
                  </div>
                </div>
      </form>
    </Modal>
  );
}
