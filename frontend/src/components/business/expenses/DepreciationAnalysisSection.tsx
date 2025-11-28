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
import { useAnalyzeDepreciation, useUpdateDepreciation } from '../../../hooks/api/useDepreciation';
import { Button } from '../../common/Button';

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

export const DepreciationAnalysisSection: React.FC<DepreciationAnalysisSectionProps> = ({
  expenseId,
  netAmount,
  expenseDate,
  existingAnalysis,
  isEditing,
  onApplyToForm,
  onSuccess,
}) => {
  const [showManualSettings, setShowManualSettings] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false); // Track if user clicked analyze
  const [manualSettings, setManualSettings] = useState({
    years: 3,
    startDate: expenseDate.split('T')[0],
    method: 'linear' as 'linear' | 'degressive',
    category: '',
  });

  const { mutate: analyze, isLoading: isAnalyzing, data: analysisData, reset: resetAnalysis } = useAnalyzeDepreciation(expenseId);
  const { mutate: updateSettings, isLoading: isUpdating } = useUpdateDepreciation(expenseId);

  // Parse existing analysis if available  
  // analysisData format: { eligible: true, analysis: {...} }
  // parsedExisting format: { recommendation, reasoning, suggested_years, ... }
  const parsedExisting = existingAnalysis ? JSON.parse(existingAnalysis) : null;
  
  // Prioritize fresh API data from analyze() over saved data
  // If user has clicked analyze in this session, always use analysisData
  // Otherwise, show the saved analysis from database
  const analysis = analysisData || (!hasAnalyzed && parsedExisting ? { analysis: parsedExisting } : null);

  const handleAnalyze = () => {
    console.log('[DepreciationAnalysis] ANALYZE BUTTON CLICKED - Expense ID:', expenseId);
    console.log('[DepreciationAnalysis] Making API call to /expenses/' + expenseId + '/analyze-depreciation');
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

    console.log('[DepreciationAnalysis] Applying AI recommendation:', settings);
    console.log('[DepreciationAnalysis] Category from AI:', analysis.analysis.suggested_category);
    console.log('[DepreciationAnalysis] Full analysis object:', analysis.analysis);

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

  return (
    <div className="space-y-4">
      {/* Analysis Trigger */}
      {!analysis && (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                AI Depreciation Analysis
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Get AI-powered recommendations for depreciation based on German tax law (AfA tables).
              </p>
            </div>
            <Button
              type="button"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="ml-4"
            >
              {isAnalyzing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Analyzing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                  Analyze with AI
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysis?.analysis && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-start">
                <svg
                  className="w-5 h-5 text-green-600 dark:text-green-400 mr-3 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <h4 className="text-sm font-medium text-green-800 dark:text-green-300">
                    AI Analysis Complete
                  </h4>
                  <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                    Confidence: {(analysis.analysis.confidence * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
              {/* Confidence Badge */}
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300">
                {analysis.analysis.confidence >= 0.8 ? 'High' : analysis.analysis.confidence >= 0.6 ? 'Medium' : 'Low'} Confidence
              </span>
            </div>

            {/* Recommendation */}
            <div className="bg-white dark:bg-gray-800 rounded p-3">
              <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Recommendation</h5>
              <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <p>
                  <strong>Type:</strong>{' '}
                  {analysis.analysis.recommendation === 'immediate' ? 'Immediate Deduction' : 'Multi-Year Depreciation'}
                </p>
                {analysis.analysis.depreciation_years && (
                  <p>
                    <strong>Depreciation Period:</strong> {analysis.analysis.depreciation_years} years
                  </p>
                )}
                <p>
                  <strong>Asset Category:</strong> {analysis.analysis.useful_life_category}
                </p>
                {analysis.analysis.suggested_category && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <p className="font-medium text-purple-700 dark:text-purple-400">
                      💡 Suggested Expense Category: <span className="capitalize">{analysis.analysis.suggested_category.replace(/_/g, ' ')}</span>
                    </p>
                    {analysis.analysis.category_reasoning && (
                      <p className="text-xs mt-1 text-gray-600 dark:text-gray-400">
                        {analysis.analysis.category_reasoning}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Tax Impact */}
            {analysis.analysis.tax_impact && (
              <div className="bg-white dark:bg-gray-800 rounded p-3">
                <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Tax Impact</h5>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600 dark:text-gray-400">First Year Deduction</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {analysis.analysis.tax_impact.first_year_deduction.toFixed(2)} EUR
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600 dark:text-gray-400">Deferred Amount</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {analysis.analysis.tax_impact.deferred_amount.toFixed(2)} EUR
                    </p>
                  </div>
                </div>
                
                {/* Tax Deductibility */}
                {analysis.analysis.tax_deductible_percentage !== undefined && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-600 dark:text-gray-400">Tax Deductible</span>
                      <span className={`text-lg font-semibold ${
                        analysis.analysis.tax_deductible_percentage === 100 
                          ? 'text-green-600 dark:text-green-400' 
                          : analysis.analysis.tax_deductible_percentage === 0 
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}>
                        {analysis.analysis.tax_deductible_percentage}%
                      </span>
                    </div>
                    {analysis.analysis.tax_deductibility_reasoning && (
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {analysis.analysis.tax_deductibility_reasoning}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Reasoning */}
            <div className="bg-white dark:bg-gray-800 rounded p-3">
              <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Reasoning</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {analysis.analysis.reasoning}
              </p>
            </div>

            {/* Sources */}
            {analysis.analysis.sources && analysis.analysis.sources.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
                <h5 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                  <span>🔗</span>
                  <span>Verified Sources</span>
                </h5>
                <div className="space-y-1.5">
                  {analysis.analysis.sources.map((source: { title: string; url: string }, index: number) => (
                    <div key={index} className="text-sm">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline flex items-start gap-1"
                      >
                        <span className="flex-1">{source.title}</span>
                        <svg className="w-3 h-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{source.url}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="text-sm"
              >
                {isAnalyzing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Re-Analyzing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Re-Analyze
                  </>
                )}
              </Button>
              
              <div className="flex items-center space-x-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleReject}
                  disabled={isUpdating}
                >
                  Manual Settings
                </Button>
                <Button
                  type="button"
                  onClick={handleAccept}
                  disabled={isUpdating}
                >
                  {isUpdating ? 'Applying...' : 'Accept Recommendation'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Settings */}
      {showManualSettings && (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">
            Manual Depreciation Settings
          </h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Depreciation Years
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={manualSettings.years}
                onChange={(e) => setManualSettings({ ...manualSettings, years: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={manualSettings.startDate}
                onChange={(e) => setManualSettings({ ...manualSettings, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Method
              </label>
              <select
                value={manualSettings.method}
                onChange={(e) => setManualSettings({ ...manualSettings, method: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="linear">Linear</option>
                <option value="degressive">Degressive</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Asset Category
              </label>
              <input
                type="text"
                value={manualSettings.category}
                onChange={(e) => setManualSettings({ ...manualSettings, category: e.target.value })}
                placeholder="e.g., Computer Equipment, Office Furniture"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowManualSettings(false)}
                disabled={isUpdating}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleManualApply}
                disabled={isUpdating}
              >
                {isUpdating ? 'Applying...' : 'Apply Settings'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
