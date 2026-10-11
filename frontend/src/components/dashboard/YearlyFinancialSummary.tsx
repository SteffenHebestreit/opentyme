import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Landmark,
  LucideIcon,
  Receipt,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useYearlyFinancialSummary } from '../../hooks/api';
import { formatCurrency } from '../../utils/currency';
import { cn } from '../../lib/cn';
import { AnimatedNumber } from '../common/AnimatedNumber';
import { Button } from '../common/Button';
import { DashboardSection } from './DashboardSection';
import { FinancialSummarySkeleton } from './DashboardSkeleton';

/** Icon accent of a key figure (same tints as StatCard). */
type Accent = 'green' | 'orange' | 'red';

const accentClasses: Record<Accent, string> = {
  green: 'bg-emerald-50 text-emerald-600 ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/20',
  orange: 'bg-orange-50 text-orange-600 ring-orange-600/10 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-400/20',
  red: 'bg-red-50 text-red-600 ring-red-600/10 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-400/20',
};

/** Sign of a figure: colours profit/loss and refund/liability. */
type Tone = 'positive' | 'negative' | 'neutral';

const toneText: Record<Tone, string> = {
  positive: 'text-emerald-600 dark:text-emerald-400',
  negative: 'text-red-600 dark:text-red-400',
  neutral: 'text-gray-900 dark:text-white',
};

const formatMoney = (value: number) => formatCurrency(value);

/**
 * Primary key figure: larger than the operational StatCards below it, with a
 * value that counts up on load and highlights when it changes after a save.
 */
const KpiCard: FC<{
  label: string;
  value: number;
  icon: LucideIcon;
  variant: Accent;
  tone?: Tone;
  hint?: string;
}> = ({ label, value, icon: Icon, variant, tone = 'neutral', hint }) => (
  <div className="surface p-5 sm:p-6">
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
          accentClasses[variant]
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
    </div>
    <p
      className={cn(
        'mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl xl:text-[1.75rem] 2xl:text-3xl',
        toneText[tone]
      )}
    >
      <AnimatedNumber value={value} format={formatMoney} />
    </p>
    {hint && <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
  </div>
);

/** A label/value pair of the compact tax card. */
const TaxFigure: FC<{ label: string; value: number; tone?: Tone; accent?: boolean }> = ({
  label,
  value,
  tone = 'neutral',
  accent = false,
}) => (
  <div className="min-w-0">
    <dt
      className={cn(
        'text-xs font-medium uppercase tracking-wider',
        accent ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'
      )}
    >
      {label}
    </dt>
    <dd className={cn('mt-1 text-base font-semibold tabular-nums', toneText[tone])}>
      <AnimatedNumber value={value} format={formatMoney} />
    </dd>
  </div>
);

const signTone = (value: number): Tone => (value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral');

/**
 * Yearly Financial Summary component for dashboard.
 *
 * The dashboard's primary key figures for the current year:
 * - Total Revenue (gross)
 * - Total Expenses (gross)
 * - Tax Payable (remaining VAT liability after prepayments)
 * - Net Profit (net revenue - net expenses)
 *
 * followed by a compact, secondary card with the tax-relevant figures
 * (net amounts, VAT, input tax and — when present — tax prepayments).
 *
 * Features:
 * - Values count up on load and highlight when they change (e.g. after a save)
 * - Profit/loss and refund/liability colour coding
 * - Skeleton while loading, inline error with retry
 * - Light and dark mode
 *
 * @component
 * @example
 * <YearlyFinancialSummary />
 *
 * @returns {JSX.Element} Yearly financial summary section
 */
export const YearlyFinancialSummary: FC = () => {
  const { t } = useTranslation('dashboard');
  const currentYear = new Date().getFullYear();
  const { data, isLoading, isError, refetch } = useYearlyFinancialSummary(currentYear);

  const title = t('yearlyFinancialSummary.title', { year: currentYear });
  const period = t('yearlyFinancialSummary.period', { start: `01.01.${currentYear}`, end: `31.12.${currentYear}` });

  if (isLoading) {
    return (
      <DashboardSection title={title} aside={period}>
        <FinancialSummarySkeleton />
      </DashboardSection>
    );
  }

  if (isError || !data) {
    return (
      <DashboardSection title={title} aside={period}>
        <div
          role="alert"
          className="flex animate-fade-in flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4 dark:border-red-500/20 dark:bg-red-500/10"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('yearlyFinancialSummary.error')}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={() => void refetch()}
          >
            {t('yearlyFinancialSummary.retry')}
          </Button>
        </div>
      </DashboardSection>
    );
  }

  const isProfit = data.net_profit >= 0;
  const isTaxRefund = data.remaining_tax_payable < 0; // Negative means we get money back
  const taxRelevantProfit = data.net_revenue - data.net_expenses;

  return (
    <DashboardSection title={title} aside={period}>
      <div className="space-y-4">
        {/* Primary key figures */}
        <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label={t('yearlyFinancialSummary.totalRevenue')}
            value={data.gross_revenue_all}
            icon={Wallet}
            variant="green"
            hint={t('yearlyFinancialSummary.totalRevenueDesc')}
          />
          <KpiCard
            label={t('yearlyFinancialSummary.totalExpenses')}
            value={data.gross_expenses_all}
            icon={Receipt}
            variant="orange"
            hint={t('yearlyFinancialSummary.totalExpensesDesc')}
          />
          <KpiCard
            label={t('yearlyFinancialSummary.taxPayable')}
            value={data.remaining_tax_payable}
            icon={Landmark}
            variant={isTaxRefund ? 'green' : 'red'}
            tone={isTaxRefund ? 'positive' : data.remaining_tax_payable > 0 ? 'negative' : 'neutral'}
            hint={t('yearlyFinancialSummary.remainingTaxPayableDesc')}
          />
          <KpiCard
            label={t('yearlyFinancialSummary.netProfit')}
            value={data.net_profit}
            icon={isProfit ? TrendingUp : TrendingDown}
            variant={isProfit ? 'green' : 'red'}
            tone={signTone(data.net_profit)}
            hint={t('yearlyFinancialSummary.netProfitDesc')}
          />
        </div>

        {/* Secondary: tax-relevant figures */}
        <div className="surface p-5">
          <h3 className="eyebrow">{t('yearlyFinancialSummary.taxBreakdownTitle')}</h3>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
            <TaxFigure label={t('yearlyFinancialSummary.netRevenue')} value={data.net_revenue} />
            <TaxFigure label={t('yearlyFinancialSummary.netExpenses')} value={data.net_expenses} />
            <TaxFigure
              label={t('yearlyFinancialSummary.taxRelevantProfit')}
              value={taxRelevantProfit}
              tone={signTone(taxRelevantProfit)}
            />
            <TaxFigure label={t('yearlyFinancialSummary.revenueTax')} value={data.revenue_tax} />
            <TaxFigure label={t('yearlyFinancialSummary.expenseTax')} value={data.expense_tax} />
          </dl>

          {/* Tax prepayments — only shown if there are any */}
          {data.total_prepayments > 0 && (
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-gray-100 pt-4 sm:grid-cols-3 dark:border-gray-800">
              <TaxFigure label={t('yearlyFinancialSummary.vatPrepayments')} value={data.vat_prepayments} accent />
              <TaxFigure
                label={t('yearlyFinancialSummary.incomeTaxPrepayments')}
                value={data.income_tax_prepayments}
                accent
              />
              <TaxFigure label={t('yearlyFinancialSummary.totalPrepayments')} value={data.total_prepayments} accent />
            </dl>
          )}
        </div>
      </div>
    </DashboardSection>
  );
};
