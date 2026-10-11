/**
 * @fileoverview Depreciation Analysis Section Component
 *
 * Provides AI-powered depreciation analysis UI for expenses:
 * - "Analyze with AI" button to trigger analysis
 * - Display of AI recommendations with confidence scores
 * - Manual depreciation settings override
 * - Accept/reject analysis actions
 *
 * @module components/business/expenses/DepreciationAnalysisSection
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ExternalLink, Lightbulb, RefreshCw, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useAnalyzeDepreciation, useUpdateDepreciation } from '../../../hooks/api/useDepreciation';
import { Button } from '../../common/Button';
import { Badge } from '../../common/Badge';
import { fieldClasses, fieldLabelClass } from '../../forms/fieldStyles';
import { formatCurrency } from '../../../utils/currency';
import { cn } from '../../../lib/cn';
import { expenseCategoryLabel } from './expenseCategories';

interface DepreciationAnalysisSectionProps {
  expenseId: string;
  netAmount: number;
  expenseDate: string;
  existingAnalysis?: string | null;
  isEditing?: boolean;
  onApplyToForm?: (settings: {
    depreciation_type: string;
    depreciation_years: number;
    depreciation_start_date: string;
    depreciation_method: 'linear' | 'degressive';
    useful_life_category?: string;
    category?: string; // AI-suggested expense category
    tax_deductible_percentage?: number;
    tax_deductibility_reasoning?: string;
  }) => void;
  onSuccess?: () => void;
}

/** Small uppercase heading inside the result card. */
const SubHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h5 className="eyebrow mb-2">{children}</h5>
);

export const DepreciationAnalysisSection: React.FC<DepreciationAnalysisSectionProps> = ({
  expenseId,
  netAmount: _netAmount,
  expenseDate,
  existingAnalysis,
  isEditing,
  onApplyToForm,
  onSuccess,
}) => {
  const { t } = useTranslation('expenses');
  const [showManualSettings, setShowManualSettings] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false); // Track if user clicked analyze
  const [manualSettings, setManualSettings] = useState({
    years: 3,
    startDate: expenseDate.split('T')[0],
    method: 'linear' as 'linear' | 'degressive',
    category: '',
  });

  const { mutate: analyze, isPending: isAnalyzing, data: analysisData, reset: resetAnalysis } = useAnalyzeDepreciation(expenseId);
  const { mutate: updateSettings, isPending: isUpdating } = useUpdateDepreciation(expenseId);

  // Parse existing analysis if available
  // analysisData format: { eligible: true, analysis: {...} }
  // parsedExisting format: { recommendation, reasoning, suggested_years, ... }
  const parsedExisting = existingAnalysis ? JSON.parse(existingAnalysis) : null;

  // Prioritize fresh API data from analyze() over saved data
  // If user has clicked analyze in this session, always use analysisData
  // Otherwise, show the saved analysis from database
  const analysis = analysisData || (!hasAnalyzed && parsedExisting ? { analysis: parsedExisting } : null);

  const handleAnalyze = () => {
    setHasAnalyzed(true); // Mark that user has clicked analyze
    resetAnalysis(); // Reset previous mutation data
    analyze();
  };

  const handleAccept = () => {
    if (!analysis?.analysis) return;

    const settings = {
      depreciation_type: analysis.analysis.recommendation,
      depreciation_years: analysis.analysis.depreciation_years ?? null, // Use nullish coalescing to preserve null
      depreciation_start_date: expenseDate.split('T')[0],
      depreciation_method: 'linear' as const,
      useful_life_category: analysis.analysis.useful_life_category,
      category: analysis.analysis.suggested_category, // Apply AI-suggested category
      tax_deductible_percentage: analysis.analysis.tax_deductible_percentage,
      tax_deductibility_reasoning: analysis.analysis.tax_deductibility_reasoning,
    };

    // If in edit mode, apply to form instead of saving immediately
    if (isEditing && onApplyToForm) {
      onApplyToForm(settings);
      return;
    }

    // Otherwise save directly
    updateSettings(settings, {
      onSuccess: () => {
        onSuccess?.();
      },
    });
  };

  const handleManualApply = () => {
    updateSettings(
      {
        depreciation_type: 'partial',
        depreciation_years: manualSettings.years,
        depreciation_start_date: manualSettings.startDate,
        depreciation_method: manualSettings.method,
        useful_life_category: manualSettings.category,
      },
      {
        onSuccess: () => {
          setShowManualSettings(false);
          onSuccess?.();
        },
      }
    );
  };

  const handleReject = () => {
    setShowManualSettings(true);
  };

  // Note: We allow AI analysis for all expenses, even those under 800 EUR.
  // The AI will determine if it's a depreciable asset (subject to GWG rules)
  // or an operating expense (always immediately deductible).
  // Early return removed - let the AI decide!

  const result = analysis?.analysis;
  const confidence = result ? Number(result.confidence) || 0 : 0;
  // The AI was not reachable and the server fell back to its rule-based estimate
  const rulesOnly = ((analysis as { source?: string } | null | undefined)?.source ?? result?.source) === 'rules';
  const deductible = result?.tax_deductible_percentage;

  return (
    <div className="space-y-4">
      {/* Analysis Trigger */}
      {!analysis && (
        <div className="animate-fade-in overflow-hidden rounded-xl border border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-white/[0.02]">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/20">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {t('analysis.title')}
                </h4>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  {isAnalyzing ? t('analysis.analyzingHint') : t('analysis.description')}
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleAnalyze}
              isLoading={isAnalyzing}
              leftIcon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
              className="shrink-0 self-start sm:self-auto"
            >
              {isAnalyzing ? t('analysis.analyzing') : t('analysis.analyze')}
            </Button>
          </div>
          {isAnalyzing && (
            <div className="relative h-0.5 overflow-hidden bg-brand-100 dark:bg-brand-500/10" aria-hidden="true">
              <div className="absolute inset-y-0 left-0 w-full origin-left animate-progress-indeterminate bg-brand-500 dark:bg-brand-400" />
            </div>
          )}
        </div>
      )}

      {/* Analysis Results */}
      {result && (
        <div className="animate-fade-up overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          {/* Header */}
          <div
            className={
              rulesOnly
                ? 'flex items-start justify-between gap-3 border-b border-gray-100 bg-amber-50/70 px-4 py-3 dark:border-gray-800 dark:bg-amber-500/[0.06]'
                : 'flex items-start justify-between gap-3 border-b border-gray-100 bg-emerald-50/60 px-4 py-3 dark:border-gray-800 dark:bg-emerald-500/[0.06]'
            }
          >
            <div className="flex items-start gap-2.5">
              <CheckCircle2
                className={
                  rulesOnly
                    ? 'mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400'
                    : 'mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400'
                }
                aria-hidden="true"
              />
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {rulesOnly ? t('analysis.rulesOnlyTitle', 'Rule-based estimate') : t('analysis.complete')}
                </h4>
                <p className="mt-0.5 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  {rulesOnly
                    ? t('analysis.rulesOnlyHint', 'The AI was not available, so standard rules were applied. Please check the result.')
                    : t('analysis.confidence', { value: (confidence * 100).toFixed(0) })}
                </p>
              </div>
            </div>
            {/* Confidence Badge — a rule-based estimate has no AI confidence */}
            {rulesOnly ? (
              <Badge variant="amber">{t('analysis.rulesBadge', 'Rules')}</Badge>
            ) : (
              <Badge variant={confidence >= 0.8 ? 'green' : confidence >= 0.6 ? 'yellow' : 'gray'}>
                {confidence >= 0.8
                  ? t('analysis.confidenceHigh')
                  : confidence >= 0.6
                  ? t('analysis.confidenceMedium')
                  : t('analysis.confidenceLow')}
              </Badge>
            )}
          </div>

          <div className="space-y-5 p-4">
            {/* Recommendation */}
            <div>
              <SubHeading>{t('analysis.recommendation')}</SubHeading>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">{t('analysis.type')}</dt>
                  <dd className="mt-0.5 font-medium text-gray-900 dark:text-white">
                    {result.recommendation === 'immediate'
                      ? t('analysis.typeImmediate')
                      : t('analysis.typePartial')}
                  </dd>
                </div>
                {result.depreciation_years && (
                  <div>
                    <dt className="text-xs text-gray-500 dark:text-gray-400">{t('analysis.period')}</dt>
                    <dd className="mt-0.5 font-medium tabular-nums text-gray-900 dark:text-white">
                      {t('analysis.yearsCount', { count: result.depreciation_years })}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">{t('analysis.assetCategory')}</dt>
                  <dd className="mt-0.5 font-medium text-gray-900 dark:text-white">
                    {result.useful_life_category}
                  </dd>
                </div>
              </dl>

              {result.suggested_category && (
                <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-brand-50 px-3 py-2.5 text-sm ring-1 ring-inset ring-brand-600/10 dark:bg-brand-500/10 dark:ring-brand-400/20">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-medium text-brand-800 dark:text-brand-200">
                      {t('analysis.suggestedCategory')}: {expenseCategoryLabel(t, result.suggested_category)}
                    </p>
                    {result.category_reasoning && (
                      <p className="mt-0.5 text-xs text-brand-700/80 dark:text-brand-200/70">
                        {result.category_reasoning}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Tax Impact */}
            {result.tax_impact && (
              <div>
                <SubHeading>{t('analysis.taxImpact')}</SubHeading>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-white/[0.03]">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('analysis.firstYear')}</p>
                    <p className="mt-0.5 text-base font-semibold tabular-nums text-gray-900 dark:text-white">
                      {formatCurrency(result.tax_impact.first_year_deduction, 'EUR')}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-white/[0.03]">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('analysis.deferred')}</p>
                    <p className="mt-0.5 text-base font-semibold tabular-nums text-gray-900 dark:text-white">
                      {formatCurrency(result.tax_impact.deferred_amount, 'EUR')}
                    </p>
                  </div>
                </div>

                {/* Tax Deductibility */}
                {deductible !== undefined && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">{t('analysis.taxDeductible')}</span>
                      <span
                        className={cn(
                          'font-semibold tabular-nums',
                          deductible === 100
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : deductible === 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-amber-600 dark:text-amber-400'
                        )}
                      >
                        {deductible}%
                      </span>
                    </div>
                    {result.tax_deductibility_reasoning && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {result.tax_deductibility_reasoning}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Reasoning */}
            <div>
              <SubHeading>{t('analysis.reasoning')}</SubHeading>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                {result.reasoning}
              </p>
            </div>

            {/* Sources */}
            {result.sources && result.sources.length > 0 && (
              <div>
                <SubHeading>{t('analysis.sources')}</SubHeading>
                <ul className="space-y-1.5">
                  {result.sources.map((source: { title: string; url: string }, index: number) => (
                    <li key={index} className="min-w-0 text-sm">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-start gap-1.5 text-brand-700 hover:underline dark:text-brand-300"
                      >
                        <span>{source.title}</span>
                        <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                      </a>
                      <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{source.url}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-white/[0.02]">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAnalyze}
              isLoading={isAnalyzing}
              leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
            >
              {isAnalyzing ? t('analysis.reanalyzing') : t('analysis.reanalyze')}
            </Button>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleReject}
                disabled={isUpdating}
                leftIcon={<SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}
              >
                {t('analysis.manual')}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleAccept}
                isLoading={isUpdating}
              >
                {isUpdating ? t('analysis.applying') : t('analysis.accept')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Settings */}
      {showManualSettings && (
        <div className="animate-fade-up rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <SlidersHorizontal className="h-4 w-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
            {t('analysis.manualTitle')}
          </h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`afa-years-${expenseId}`} className={fieldLabelClass()}>
                {t('depreciation.years', 'Depreciation Years')}
              </label>
              <input
                id={`afa-years-${expenseId}`}
                type="number"
                min="1"
                max="50"
                value={manualSettings.years}
                onChange={(e) => setManualSettings({ ...manualSettings, years: parseInt(e.target.value) })}
                className={cn(fieldClasses(), 'tabular-nums')}
              />
            </div>
            <div>
              <label htmlFor={`afa-start-${expenseId}`} className={fieldLabelClass()}>
                {t('depreciation.startDate', 'Start Date')}
              </label>
              <input
                id={`afa-start-${expenseId}`}
                type="date"
                value={manualSettings.startDate}
                onChange={(e) => setManualSettings({ ...manualSettings, startDate: e.target.value })}
                className={fieldClasses()}
              />
            </div>
            <div>
              <label htmlFor={`afa-method-${expenseId}`} className={fieldLabelClass()}>
                {t('depreciation.method', 'Method')}
              </label>
              <select
                id={`afa-method-${expenseId}`}
                value={manualSettings.method}
                onChange={(e) => setManualSettings({ ...manualSettings, method: e.target.value as any })}
                className={fieldClasses()}
              >
                <option value="linear">{t('analysis.methodLinear')}</option>
                <option value="degressive">{t('analysis.methodDegressive')}</option>
              </select>
            </div>
            <div>
              <label htmlFor={`afa-category-${expenseId}`} className={fieldLabelClass()}>
                {t('analysis.assetCategory')}
              </label>
              <input
                id={`afa-category-${expenseId}`}
                type="text"
                value={manualSettings.category}
                onChange={(e) => setManualSettings({ ...manualSettings, category: e.target.value })}
                placeholder={t('analysis.assetCategoryPlaceholder')}
                className={fieldClasses()}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowManualSettings(false)}
              disabled={isUpdating}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleManualApply}
              isLoading={isUpdating}
            >
              {isUpdating ? t('analysis.applying') : t('analysis.apply')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
