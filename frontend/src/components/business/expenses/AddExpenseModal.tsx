import { useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  Info,
  ListChecks,
  Calculator,
  Paperclip,
  Receipt,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useCreateExpense } from '@/hooks/api/useExpenses';
import { useProjects } from '@/hooks/api/useProjects';
import { ExpenseCategory } from '@/api/types';
import { Input, CustomSelect, Textarea } from '@/components/forms';
import { FileDropZone } from '@/components/forms/FileDropZone';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/common/Button';
import { Alert, type AlertType } from '@/components/common/Alert';
import { useUploadReceipt } from '@/hooks/api/useExpenses';
import { analyzeReceipt } from '@/api/services/expense.service';
import type { AnalyzedLineItem } from '@/api/services/expense.service';
import { DepreciationSettings } from '@/components/business/expenses/DepreciationSettings';
import { expenseCategoryLabel, getExpenseCategoryOptions } from '@/components/business/expenses/expenseCategories';
import { useAnalyzeDepreciationDraft } from '@/hooks/api/useDepreciation';
import { Slot } from '@/plugins/slots';
import { usePlugins } from '@/api/hooks/usePlugins';
import { formatCurrency } from '@/utils/currency';
import { cn } from '@/lib/cn';
import { extractErrorMessage } from '../../../utils/error';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExpenseAdded: () => void;
}

/** A status line shown after an AI step (receipt analysis, AfA analysis, split booking). */
interface Notice {
  tone: AlertType;
  text: string;
}

const checkboxClass =
  'h-4 w-4 shrink-0 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900';

/** Heading of one group of fields in the form. */
function SectionHeading({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-4 w-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      {children}
    </div>
  );
}

/** Thin indeterminate bar shown while an AI request runs. */
function WorkingBar() {
  return (
    <div className="relative h-0.5 overflow-hidden bg-purple-100 dark:bg-purple-500/10" aria-hidden="true">
      <div className="absolute inset-y-0 left-0 w-full origin-left animate-progress-indeterminate bg-purple-500 dark:bg-purple-400" />
    </div>
  );
}

const sectionClass = 'py-5 first:pt-0 last:pb-0';

export function AddExpenseModal({ isOpen, onClose, onExpenseAdded }: AddExpenseModalProps) {
  const { t, i18n } = useTranslation('expenses');
  const { data: pluginsData } = usePlugins();
  const aiAddonEnabled = pluginsData?.plugins?.find((p) => p.name === 'ai-expense-analysis')?.userEnabled ?? false;
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
  const [analysisMessage, setAnalysisMessage] = useState<Notice | null>(null);
  // Set once the receipt analysis succeeds, so the modal can offer the AfA
  // analysis right away instead of making the user save and reopen the expense.
  const [offerDepreciationAnalysis, setOfferDepreciationAnalysis] = useState(false);
  const [depreciationMessage, setDepreciationMessage] = useState<Notice | null>(null);
  // Positions of a bundled invoice. Non-empty only when the receipt covers
  // several distinct articles, which have to be booked separately: the GWG
  // limit and the AfA useful life both apply per article, not per invoice.
  const [lineItems, setLineItems] = useState<AnalyzedLineItem[]>([]);
  const [selectedLineItems, setSelectedLineItems] = useState<boolean[]>([]);
  const [splitProgress, setSplitProgress] = useState<Notice | null>(null);
  const [isSplitting, setIsSplitting] = useState(false);

  // Recurring expense fields
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState('monthly');
  const [recurrenceStartDate, setRecurrenceStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');

  // Depreciation fields
  const [depreciationType, setDepreciationType] = useState<'none' | 'immediate' | 'partial' | null>('none');
  const [depreciationYears, setDepreciationYears] = useState<number | null>(null);
  const [depreciationMethod, setDepreciationMethod] = useState<'linear' | 'degressive' | null>('linear');
  const [depreciationCategory, setDepreciationCategory] = useState<string | null>(null);

  // Calculate tax breakdown
  const totalAmount = parseFloat(amount) || 0;
  const taxRatePercent = parseFloat(taxRate) || 0;
  const taxMultiplier = 1 + (taxRatePercent / 100);
  const netAmount = totalAmount / taxMultiplier;
  const taxAmount = totalAmount - netAmount;

  const createExpense = useCreateExpense();
  const uploadReceipt = useUploadReceipt();
  const analyzeDepreciationDraft = useAnalyzeDepreciationDraft();
  const { data: projects = [] } = useProjects();

  const categoryOptions = getExpenseCategoryOptions(t);

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
      setAnalysisMessage(null);
      setOfferDepreciationAnalysis(false);
      setDepreciationMessage(null);
      setLineItems([]);
      setSelectedLineItems([]);
      setSplitProgress(null);
      setIsSplitting(false);
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
      setAnalysisMessage({ tone: 'warning', text: t('ai.selectFileFirst') });
      return;
    }

    if (!isAnalysable(receiptFile)) {
      setAnalysisMessage({
        tone: 'warning',
        text: t('ai.unsupportedType', 'Only PDFs and images (JPEG, PNG, WebP) can be analyzed'),
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisMessage(null);

    try {
      const result = await analyzeReceipt(receiptFile);

      if (result.success && result.ai_enabled === false) {
        // AI switched off: the receipt text was read, but nothing was extracted from it
        const rawText = (result.data as { raw_text?: string } | undefined)?.raw_text?.trim();
        if (rawText) setNotes((prev) => prev || rawText);
        setAnalysisMessage({
          tone: 'warning',
          text: t('ai.aiDisabledRawText', 'The AI assistant is switched off — the receipt text was copied to the notes. Please fill in the details manually.'),
        });
      } else if (result.success && result.data) {
        const extracted = result.data;

        // Pre-fill form with extracted data.
        // `description` is the only field shown in the expense overview, so it has
        // to carry what was actually bought. Vendor, seller and invoice number are
        // supporting context and go to the notes instead.
        if (extracted.amount) setAmount(extracted.amount.toString());
        if (extracted.date) setExpenseDate(extracted.date);

        const label = extracted.description?.trim() || extracted.vendor?.trim();
        if (label) setDescription(label);

        // Only accept a category the select can actually display.
        if (extracted.category && categoryOptions.some((o) => o.value === extracted.category)) {
          setCategory(extracted.category);
        }

        const context = [
          extracted.vendor && `${t('ai.vendor', 'Vendor')}: ${extracted.vendor}`,
          extracted.seller &&
            extracted.seller !== extracted.vendor &&
            `${t('ai.seller', 'Sold by')}: ${extracted.seller}`,
          extracted.invoice_number &&
            `${t('ai.invoiceNumber', 'Invoice no.')}: ${extracted.invoice_number}`,
        ].filter(Boolean);
        if (context.length) setNotes(context.join('\n'));

        if (extracted.currency) setCurrency(extracted.currency);
        // 0 % is a valid rate (e.g. reverse charge, small business) — only skip when absent
        if (extracted.tax_rate !== undefined && extracted.tax_rate !== null) {
          setTaxRate((extracted.tax_rate * 100).toString());
        }

        const confidence = result.data.confidence || 0;
        setAnalysisMessage({ tone: 'success', text: t('ai.analysisComplete', { confidence }) });
        // A bundled invoice has to be booked per article, so offer the split
        // instead of the single-expense AfA shortcut.
        const items = extracted.line_items ?? [];
        setLineItems(items);
        setSelectedLineItems(items.map(() => true));
        setSplitProgress(null);

        // Everything the AfA analysis needs is now in the form, so offer it here
        // rather than after a save/reopen round trip.
        setDepreciationMessage(null);
        setOfferDepreciationAnalysis(items.length === 0 && Boolean(label && extracted.amount));
      } else {
        setAnalysisMessage({ tone: 'warning', text: result.message || t('ai.analysisFailedManual') });
      }
    } catch (error) {
      console.error('Failed to analyze receipt:', error);
      const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
      const byCode: Record<string, string> = {
        NO_TEXT: t('ai.errors.noText', 'No text could be read from this receipt. Please enter the details manually.'),
        AI_UNREACHABLE: t('ai.errors.unreachable', 'The AI service is not reachable. Check the AI settings or try again later.'),
        AI_TIMEOUT: t('ai.errors.timeout', 'The AI took too long to read the receipt. Please try again.'),
        AI_DISABLED: t('ai.errors.disabled', 'The AI assistant is switched off in the settings.'),
        AI_AUTH: t('ai.errors.auth', 'The AI service rejected the API key. Check it in the AI settings.'),
        AI_INVALID_RESPONSE: t('ai.errors.invalidResponse', 'The AI returned an unusable answer. Please try again or enter the details manually.'),
        EXTRACTION_FAILED: t('ai.errors.extractionFailed', 'The receipt could not be read (document converter error). Please try again or enter the details manually.'),
        UNSUPPORTED_TYPE: t('ai.errors.unsupportedType', 'This file type cannot be analysed. Use a PDF or an image.'),
      };
      setAnalysisMessage({
        tone: code === 'NO_TEXT' ? 'warning' : 'error',
        text: (code && byCode[code]) || `${t('ai.analysisFailed')}: ${extractErrorMessage(error)}`,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  /**
   * Run the AfA analysis on the values currently in the form.
   *
   * Uses the draft endpoint so no expense has to exist yet — the recommendation
   * is applied to the depreciation fields and saved together with everything
   * else when the user submits.
   */
  const handleAnalyzeDepreciation = async () => {
    const parsedAmount = parseFloat(amount);
    if (!description.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setDepreciationMessage({
        tone: 'warning',
        text: t('ai.depreciationNeedsData', 'Please fill in a description and amount first.'),
      });
      return;
    }

    setDepreciationMessage(null);

    try {
      const result = await analyzeDepreciationDraft.mutateAsync({
        description,
        notes,
        category,
        amount: parsedAmount,
        net_amount: parseFloat(netAmount.toFixed(2)),
        tax_amount: parseFloat(taxAmount.toFixed(2)),
        tax_rate: parseFloat(taxRate) / 100,
        expense_date: expenseDate,
      });

      const analysis = result.analysis;
      if (!analysis) {
        setDepreciationMessage({
          tone: 'warning',
          text: result.reason || t('ai.depreciationNoResult', 'No depreciation recommendation returned.'),
        });
        return;
      }

      setDepreciationType(analysis.depreciation_type);
      setDepreciationYears(analysis.depreciation_years ?? null);
      setDepreciationCategory(analysis.useful_life_category ?? null);

      // The AfA analysis reasons about the asset itself and often lands on a
      // better category than the receipt extraction did.
      if (
        analysis.suggested_category &&
        categoryOptions.some((o) => o.value === analysis.suggested_category)
      ) {
        setCategory(analysis.suggested_category);
      }

      setOfferDepreciationAnalysis(false);
      const rulesOnly = (result.source ?? analysis.source) === 'rules';
      const confidence = Math.round((Number(analysis.confidence) || 0) * (Number(analysis.confidence) <= 1 ? 100 : 1));
      setDepreciationMessage({
        tone: rulesOnly ? 'warning' : 'success',
        text: rulesOnly
          ? `${t('ai.depreciationRulesOnly', 'The AI was not available — this is a rule-based estimate. Please check it.')} ${analysis.reasoning}`
          : `${t('ai.depreciationDone', 'Depreciation analysis complete')} (${confidence} %): ${analysis.reasoning}`,
      });
    } catch (error) {
      console.error('Failed to analyze depreciation:', error);
      setDepreciationMessage({
        tone: 'error',
        text: `${t('ai.depreciationFailed', 'Depreciation analysis failed')}: ${extractErrorMessage(error)}`,
      });
    }
  };

  /**
   * Whether a receipt can be sent to the AI analysis.
   *
   * The MCP server reads photographed and scanned receipts as well as PDFs, so
   * images qualify too. Mirrors ANALYSABLE_TYPES in expense-receipt.controller.
   */
  const isAnalysable = (file: File) =>
    file.type === 'application/pdf' || /^image\/(jpeg|jpg|png|webp)$/.test(file.type);

  /** Gross total of the positions the user has ticked. */
  const selectedLineItemTotal = lineItems.reduce(
    (sum, item, index) => (selectedLineItems[index] ? sum + item.amount : sum),
    0
  );
  const selectedLineItemCount = selectedLineItems.filter(Boolean).length;
  // The extraction is told the positions must add up to the invoice total, but
  // it is still a language model — show the user when they do not.
  const lineItemsReconcile =
    lineItems.length > 0 &&
    Math.abs(lineItems.reduce((sum, i) => sum + i.amount, 0) - (parseFloat(amount) || 0)) < 0.02;

  const toggleLineItem = (index: number) => {
    setSelectedLineItems((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  /**
   * Book one expense per ticked invoice position.
   *
   * Each position becomes its own expense so it gets its own GWG/AfA treatment,
   * and the receipt PDF is attached to every one of them so each row carries its
   * own proof. Runs sequentially — a partial failure reports how far it got
   * rather than silently leaving a half-booked invoice behind.
   */
  const handleCreateSplitExpenses = async () => {
    const chosen = lineItems.filter((_, index) => selectedLineItems[index]);
    if (chosen.length === 0) return;

    setIsSplitting(true);
    setSplitProgress(null);

    let created = 0;
    try {
      for (const item of chosen) {
        setSplitProgress({
          tone: 'info',
          text: t('ai.splitProgress', 'Creating expense {{current}} of {{total}}...', {
            current: created + 1,
            total: chosen.length,
          }),
        });

        const itemTaxRate = item.tax_rate ?? (parseFloat(taxRate) / 100 || 0);
        const itemNet = item.amount / (1 + itemTaxRate);
        const quantity = item.quantity && item.quantity > 1 ? item.quantity : 1;

        const itemNotes = [
          notes,
          quantity > 1 && item.unit_amount
            ? `${quantity} x ${item.unit_amount.toFixed(2)} ${currency}`
            : null,
        ]
          .filter(Boolean)
          .join('\n');

        const newExpense = await createExpense.mutateAsync({
          description: quantity > 1 ? `${quantity}x ${item.description}` : item.description,
          amount: item.amount,
          net_amount: parseFloat(itemNet.toFixed(2)),
          tax_rate: itemTaxRate,
          tax_amount: parseFloat((item.amount - itemNet).toFixed(2)),
          category: (item.category || category) as ExpenseCategory,
          expense_date: expenseDate,
          project_id: projectId || null,
          is_billable: isBillable,
          is_reimbursable: isReimbursable,
          notes: itemNotes || null,
          currency,
        } as any);

        // Attach the receipt to every expense so each one stands on its own.
        if (receiptFile && newExpense.id) {
          await uploadReceipt.mutateAsync({ expenseId: newExpense.id, file: receiptFile });
        }
        created += 1;
      }

      onExpenseAdded();
      onClose();
    } catch (error) {
      console.error('Failed to create split expenses:', error);
      setSplitProgress({
        tone: 'error',
        text: `${t('ai.splitFailed', 'Created {{created}} of {{total}} expenses, then failed', {
          created,
          total: chosen.length,
        })}: ${extractErrorMessage(error)}`,
      });
      if (created > 0) onExpenseAdded();
    } finally {
      setIsSplitting(false);
    }
  };

  const formId = 'add-expense-form';

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

  const optionTileClass =
    'flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm font-medium text-gray-700 transition-colors ' +
    'hover:bg-gray-50 has-[:checked]:border-purple-300 has-[:checked]:bg-purple-50/60 has-[:checked]:text-gray-900 ' +
    'dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.02] dark:has-[:checked]:border-purple-500/40 dark:has-[:checked]:bg-purple-500/[0.08] dark:has-[:checked]:text-white';

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={t('add')}
      description={t('addDescription')}
      icon={<Receipt className="h-4 w-4" aria-hidden="true" />}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} isLoading={createExpense.isPending}>
            {createExpense.isPending ? t('adding') : t('addExpense')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="divide-y divide-gray-100 dark:divide-gray-800">
        {/* Receipt & AI analysis */}
        <section className={sectionClass}>
          <SectionHeading icon={Paperclip} title={t('fields.receipt')} />

          <FileDropZone
            file={receiptFile}
            onFile={setReceiptFile}
            accept="image/*,application/pdf"
            prompt={t('receipt.dropPrompt')}
            hint={t('receiptMaxSize')}
            changeLabel={t('receipt.change')}
            removeLabel={t('receipt.remove')}
            locale={i18n.language}
          />

          {receiptFile && (
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                leftIcon={<Eye className="h-4 w-4" aria-hidden="true" />}
                onClick={() => {
                  const url = URL.createObjectURL(receiptFile);
                  window.open(url, '_blank');
                }}
              >
                {t('receipt.preview')}
              </Button>
            </div>
          )}

          {receiptFile && isAnalysable(receiptFile) && aiAddonEnabled && (
            <div className="mt-3 animate-fade-in overflow-hidden rounded-xl border border-purple-200/70 bg-purple-50/50 dark:border-purple-500/20 dark:bg-purple-500/[0.06]">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-purple-600 ring-1 ring-inset ring-purple-600/15 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-400/20">
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('ai.panelTitle')}</p>
                    <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                      {isAnalyzing ? t('ai.analyzingHint') : t('ai.panelHint')}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAnalyzeReceipt}
                  isLoading={isAnalyzing}
                  leftIcon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
                  className="shrink-0 self-start sm:self-auto"
                >
                  {isAnalyzing ? t('ai.analyzing') : t('ai.analyzeReceipt', 'Analyze Receipt with AI')}
                </Button>
              </div>
              {isAnalyzing && <WorkingBar />}
            </div>
          )}

          {analysisMessage && (
            <Alert className="mt-3" type={analysisMessage.tone} message={analysisMessage.text} />
          )}

          {/* Positions of a bundled invoice */}
          {lineItems.length > 0 && (
            <div className="mt-3 animate-fade-up overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-start gap-3 border-b border-gray-100 bg-blue-50/60 px-4 py-3 dark:border-gray-800 dark:bg-blue-500/[0.06]">
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {t('ai.splitTitle', 'This invoice contains {{count}} positions', {
                      count: lineItems.length,
                    })}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                    {t(
                      'ai.splitHint',
                      'The 800 EUR GWG limit and the depreciation period apply per article, not per invoice. Book them separately to get the tax treatment right.'
                    )}
                  </p>
                </div>
              </div>

              <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800/70">
                {lineItems.map((item, index) => (
                  <li key={`${item.description}-${index}`}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                      <input
                        type="checkbox"
                        checked={selectedLineItems[index] ?? false}
                        onChange={() => toggleLineItem(index)}
                        disabled={isSplitting}
                        className={checkboxClass}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-gray-900 dark:text-white">
                          {item.quantity && item.quantity > 1 ? `${item.quantity}x ` : ''}
                          {item.description}
                        </span>
                        {item.category && (
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            {expenseCategoryLabel(t, item.category)}
                          </span>
                        )}
                      </span>
                      <span className="whitespace-nowrap text-right text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                        {formatCurrency(item.amount, currency)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50/70 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.02]">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
                  <span className="text-gray-600 dark:text-gray-400">
                    {t('ai.splitSelected', 'Selected')}:{' '}
                    <span className="font-semibold tabular-nums text-gray-900 dark:text-white">
                      {formatCurrency(selectedLineItemTotal, currency)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 font-medium',
                      lineItemsReconcile
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    )}
                  >
                    {lineItemsReconcile ? (
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {lineItemsReconcile
                      ? t('ai.splitReconciles', 'positions match the invoice total')
                      : t(
                          'ai.splitMismatch',
                          'positions do NOT add up to the invoice total — check them'
                        )}
                  </span>
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setLineItems([]);
                      setSelectedLineItems([]);
                      setOfferDepreciationAnalysis(Boolean(description && amount));
                    }}
                    disabled={isSplitting}
                  >
                    {t('ai.splitCombined', 'Keep as one expense')}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleCreateSplitExpenses}
                    disabled={selectedLineItemCount === 0}
                    isLoading={isSplitting}
                  >
                    {isSplitting
                      ? t('ai.splitRunning', 'Creating...')
                      : t('ai.splitCreate', 'Create {{count}} expenses', {
                          count: selectedLineItemCount,
                        })}
                  </Button>
                </div>

                {splitProgress && <Alert type={splitProgress.tone} message={splitProgress.text} />}
              </div>
            </div>
          )}

          {/* Offer the AfA analysis right after a successful receipt analysis */}
          {offerDepreciationAnalysis && aiAddonEnabled && (
            <div className="mt-3 animate-fade-up overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-purple-600 dark:text-purple-300" aria-hidden="true" />
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {analyzeDepreciationDraft.isPending
                      ? t('ai.depreciationRunningHint')
                      : t('ai.depreciationPrompt', 'Analyze depreciation (AfA) for this expense now as well?')}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setOfferDepreciationAnalysis(false)}
                    disabled={analyzeDepreciationDraft.isPending}
                  >
                    {t('ai.depreciationNo', 'Skip')}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleAnalyzeDepreciation}
                    isLoading={analyzeDepreciationDraft.isPending}
                  >
                    {analyzeDepreciationDraft.isPending
                      ? t('ai.depreciationRunning', 'Analyzing depreciation...')
                      : t('ai.depreciationYes', 'Yes, analyze now')}
                  </Button>
                </div>
              </div>
              {analyzeDepreciationDraft.isPending && <WorkingBar />}
            </div>
          )}

          {depreciationMessage && (
            <Alert className="mt-3" type={depreciationMessage.tone} message={depreciationMessage.text} />
          )}
        </section>

        {/* Expense details */}
        <section className={sectionClass}>
          <SectionHeading icon={FileText} title={t('sections.details')} />

          {/* Fields keep their bottom margin; cancel the last one so sections stay even */}
          <div className="-mb-4">
            {/* Description */}
            <Input
              label={t('fields.description')}
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('fields.descriptionPlaceholder')}
              required
            />

            {/* Amount, Currency and Tax Rate */}
            <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)]">
              <Input
                label={t('fields.amount')}
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="tabular-nums"
                required
              />
              <CustomSelect
                className="mb-4"
                label={t('fields.currency')}
                value={currency}
                onChange={setCurrency}
                options={currencyOptions}
              />
              <CustomSelect
                className="col-span-2 mb-4 sm:col-span-1"
                label={t('tax.taxRate')}
                value={taxRate}
                onChange={setTaxRate}
                options={taxRateOptions}
              />
            </div>

            {/* Tax Breakdown Display */}
            <div className="collapsible" data-open={totalAmount > 0} aria-hidden={totalAmount <= 0}>
              <div>
                <div className="mb-4 rounded-lg bg-gray-50 px-4 py-3 ring-1 ring-inset ring-gray-200 dark:bg-white/[0.03] dark:ring-gray-800">
                  <p className="eyebrow mb-2">{t('tax.breakdown')}</p>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-600 dark:text-gray-400">{t('tax.netAmount')}</dt>
                      <dd className="font-medium tabular-nums text-gray-900 dark:text-white">
                        {formatCurrency(netAmount, currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-600 dark:text-gray-400">
                        {t('tax.taxAmount')} ({taxRatePercent}%)
                      </dt>
                      <dd className="font-medium tabular-nums text-gray-900 dark:text-white">
                        {formatCurrency(taxAmount, currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-gray-200 pt-1.5 dark:border-gray-800">
                      <dt className="font-semibold text-gray-700 dark:text-gray-300">{t('tax.total')}</dt>
                      <dd className="font-semibold tabular-nums text-gray-900 dark:text-white">
                        {formatCurrency(totalAmount, currency)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>

            {/* Category and Date */}
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <CustomSelect
                className="mb-4"
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
              className="mb-4"
              label={t('fields.project')}
              value={projectId}
              onChange={setProjectId}
              options={projectOptions}
            />

            {/* Notes */}
            <Textarea
              label={t('fields.notes')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notesPlaceholder')}
              rows={3}
            />
          </div>
        </section>

        {/* Options */}
        <section className={sectionClass}>
          <SectionHeading icon={SlidersHorizontal} title={t('sections.options')} />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className={optionTileClass}>
              <input
                type="checkbox"
                checked={isBillable}
                onChange={(e) => setIsBillable(e.target.checked)}
                className={checkboxClass}
              />
              {t('billableToClient')}
            </label>
            <label className={optionTileClass}>
              <input
                type="checkbox"
                checked={isReimbursable}
                onChange={(e) => setIsReimbursable(e.target.checked)}
                className={checkboxClass}
              />
              {t('fields.isReimbursable')}
            </label>
            <label className={optionTileClass}>
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className={checkboxClass}
              />
              {t('recurring.isRecurring', 'Recurring Expense')}
            </label>
          </div>

          {/* Recurring Expense Settings */}
          {isRecurring && (
            <div className="mt-3 animate-fade-in rounded-lg border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
              {/* Frequency */}
              <CustomSelect
                className="mb-4"
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
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
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

              {/* Info */}
              <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {t('recurring.info', 'This expense will be automatically generated based on the selected frequency. The system runs daily at 2 AM to create new expense entries.')}
                </span>
              </p>
            </div>
          )}
        </section>

        {/* Depreciation Settings */}
        <section className={sectionClass}>
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
        </section>

        {/* Addon injection point: expense form actions
            Addons can render buttons or sections here (e.g., AI receipt scan).
            Context provides form field setters so addons can pre-fill the form. */}
        <Slot
          name="expense-form-actions"
          className="py-5 last:pb-0"
          context={{
            setDescription,
            setAmount,
            setCurrency,
            setCategory,
            setExpenseDate,
            setNotes,
          }}
        />
      </form>
    </Modal>
  );
}
