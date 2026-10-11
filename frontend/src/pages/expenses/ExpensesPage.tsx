import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useExpenses, useExpenseSummary, useTriggerRecurringExpenses } from '@/hooks/api/useExpenses';
import { useQuery } from '@tanstack/react-query';
import type { Expense } from '@/api/types';
import { getDepreciationSummary } from '@/api/services/depreciation.service';
import { AddExpenseModal } from '@/components/business/expenses/AddExpenseModal';
import { ExpenseDetailModal } from '@/components/business/expenses/ExpenseDetailModal';
import { RecurringExpensesManager } from '@/components/business/expenses/RecurringExpensesManager';
import { expenseCategoryLabel } from '@/components/business/expenses/expenseCategories';
import { CustomSelect } from '@/components/forms';
import { fieldClasses } from '@/components/forms/fieldStyles';
import { formatCurrency } from '@/utils/currency';
import { Table, Column } from '@/components/common/Table';
import { Alert } from '@/components/common/Alert';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Card, CardBody, CardHeader } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { SkeletonItem } from '@/components/common/Skeleton';
import { StatCard } from '@/components/common/StatCard';
import { Tabs, TabPanel } from '@/components/common/Tabs';
import { useChartColors } from '@/hooks/ui/useChartTheme';
import {
  chartColors,
  getChartThemeColors,
  getDoughnutChartOptions,
  getLineChartOptions,
  withAlpha,
} from '@/utils/chartConfig';
import { cn } from '@/lib/cn';
import {
  Calculator,
  CalendarRange,
  Check,
  Hourglass,
  Layers,
  LineChart,
  PieChart,
  Plus,
  Receipt,
  RefreshCw,
  Repeat,
  Search,
  Wallet,
} from 'lucide-react';
import {
  Chart,
  ArcElement,
  Tooltip,
  Legend,
  DoughnutController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Filler,
} from 'chart.js';
import type { ChartOptions } from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';

// Register Chart.js components
Chart.register(
  ArcElement,
  Tooltip,
  Legend,
  DoughnutController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Filler
);

/**
 * Expenses page component for tracking and managing business expenses.
 *
 * Rendered as a tab inside the Finances page, so it has a section header
 * rather than a page title and adds no outer padding.
 *
 * Features:
 * - Display expenses with full details (category, project, status, receipts)
 * - Filter by category and search by description
 * - Expense summary, category breakdown and trend over time
 * - Depreciation (AfA) summary for the current year
 * - Add/edit/delete expenses and manage receipts
 * - Recurring expense templates
 *
 * @component
 * @returns {JSX.Element} Expenses section with table, filters, and summary
 */

interface ExpensesPageProps {
  startDate?: string;
  endDate?: string;
}

type ExpensesTab = 'expense-list' | 'expense-recurring';

/**
 * The doughnut shows at most this many slices: beyond it the smallest categories are
 * merged into "Other", so every slice gets its own colour from the colour-blind-safe
 * chart palette (colours follow the ranking, not the category).
 */
const MAX_CATEGORY_SLICES = 6;
const OTHER_SLICE_COLOR = { light: '#9ba4b0', dark: '#4c5764' } as const;

export default function ExpensesPage({ startDate: propStartDate, endDate: propEndDate }: ExpensesPageProps = {}) {
  const { t, i18n } = useTranslation('expenses');
  const locale = i18n.language;
  const { theme, palette } = useChartColors();
  const [activeTab, setActiveTab] = useState<ExpensesTab>('expense-list');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  // The detail modal stays mounted while it closes so it can animate out;
  // the session counter gives every opening fresh modal state.
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSession, setDetailSession] = useState(0);

  const openExpense = (expenseId: string) => {
    setSelectedExpenseId(expenseId);
    setDetailSession((session) => session + 1);
    setDetailOpen(true);
  };

  // Build filters for API
  const filters = {
    date_from: propStartDate,
    date_to: propEndDate,
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
    search: searchTerm || undefined,
    limit: 0, // Request all expenses (no limit) for complete chart data
  };

  const { data: expenses = [], isLoading, error, refetch } = useExpenses(filters);
  const { data: summary } = useExpenseSummary(filters);
  const triggerRecurring = useTriggerRecurringExpenses();

  // Fetch depreciation summary for current year
  const currentYear = new Date().getFullYear();
  const { data: depreciationSummary } = useQuery({
    queryKey: ['depreciation-summary', currentYear],
    queryFn: () => getDepreciationSummary(currentYear),
  });

  // Format date
  const formatDate = useCallback(
    (dateString: string) =>
      new Date(dateString).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    [locale]
  );

  // Category options
  const categoryOptions = [
    { value: 'all', label: t('categories.all') },
    { value: 'travel', label: t('categories.travel') },
    { value: 'meals', label: t('categories.meals') },
    { value: 'software', label: t('categories.software') },
    { value: 'hardware', label: t('categories.hardware') },
    { value: 'office_supplies', label: t('categories.office_supplies') },
    { value: 'professional_services', label: t('categories.professional_services') },
    { value: 'marketing', label: t('categories.marketing') },
    { value: 'utilities', label: t('categories.utilities') },
    { value: 'training', label: t('categories.training') },
    { value: 'other', label: t('categories.other') },
  ];

  // Get category label
  const getCategoryLabel = useCallback((category: string) => expenseCategoryLabel(t, category), [t]);

  // Calculate category breakdown, largest first
  const sortedCategories = useMemo(() => {
    const breakdown = expenses.reduce((acc, expense) => {
      const category = expense.category || 'other';
      if (!acc[category]) {
        acc[category] = { total: 0, count: 0 };
      }
      acc[category].total += Number(expense.amount) || 0;
      acc[category].count += 1;
      return acc;
    }, {} as Record<string, { total: number; count: number }>);
    return Object.entries(breakdown).sort(([, a], [, b]) => b.total - a.total);
  }, [expenses]);

  // Calculate total from category breakdown
  const categoryTotal = sortedCategories.reduce((sum, [, data]) => sum + data.total, 0);

  // Calculate average per month
  const monthlyAverage = (() => {
    if (!summary || summary.total_amount === 0) return 0;

    // Group expenses by month to count unique months
    const months = new Set<string>();
    expenses.forEach((expense) => {
      const date = new Date(expense.expense_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.add(monthKey);
    });

    const monthCount = months.size || 1;
    return summary.total_amount / monthCount;
  })();

  // Doughnut slices: the biggest categories in palette order, the rest merged into "Other"
  const categorySlices = useMemo(() => {
    const head =
      sortedCategories.length > MAX_CATEGORY_SLICES ? sortedCategories.slice(0, MAX_CATEGORY_SLICES - 1) : sortedCategories;
    const rest = sortedCategories.slice(head.length);
    const slices = head.map(([category, data], index) => ({
      key: category,
      label: getCategoryLabel(category),
      total: data.total,
      color: palette[index % palette.length],
      members: [] as string[],
    }));
    if (rest.length > 0) {
      slices.push({
        key: '__other',
        label: t('charts.otherCategories', { count: rest.length }),
        total: rest.reduce((sum, [, data]) => sum + data.total, 0),
        color: OTHER_SLICE_COLOR[theme],
        members: rest.map(([category]) => getCategoryLabel(category)),
      });
    }
    return slices;
  }, [sortedCategories, getCategoryLabel, palette, theme, t]);

  // Doughnut: expenses by category
  const doughnutData = useMemo(
    () => ({
      labels: categorySlices.map((slice) => slice.label),
      datasets: [
        {
          data: categorySlices.map((slice) => slice.total),
          backgroundColor: categorySlices.map((slice) => slice.color),
        },
      ],
    }),
    [categorySlices]
  );

  const doughnutOptions = useMemo<ChartOptions<'doughnut'>>(() => {
    const base = getDoughnutChartOptions(theme);
    const colors = getChartThemeColors(theme);
    return {
      ...base,
      responsive: true,
      maintainAspectRatio: true,
      cutout: '68%',
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        ...base.plugins,
        legend: { display: false },
        tooltip: {
          ...base.plugins?.tooltip,
          mode: 'nearest',
          intersect: true,
          callbacks: {
            label: (context) => {
              const value = context.parsed;
              const percentage = categoryTotal ? ((value / categoryTotal) * 100).toFixed(1) : '0.0';
              return `${formatCurrency(value)} (${percentage}%)`;
            },
          },
        },
      },
      elements: { arc: { borderWidth: 2, borderColor: colors.surface, hoverOffset: 4 } },
    };
  }, [theme, categoryTotal]);

  // Expense trend: monthly totals over the selected range
  const trend = useMemo(() => {
    // Group expenses by month
    const monthlyData: Record<string, number> = {};
    expenses.forEach((expense) => {
      // Parse date string as local date to avoid timezone issues
      // expense_date format is "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss..."
      const dateStr = expense.expense_date.split('T')[0]; // Get just the date part
      const [year, month] = dateStr.split('-');
      const monthKey = `${year}-${month}`;
      monthlyData[monthKey] = (monthlyData[monthKey] || 0) + Number(expense.amount);
    });

    // Generate all months in the date range (or current year up to today if no date range)
    const allMonths: string[] = [];
    let startMonth: Date;
    let endMonth: Date;

    // Get today's date in local timezone
    const today = new Date();
    const thisYear = today.getFullYear();

    if (propStartDate && propEndDate) {
      // Use the provided date range (inclusive)
      // Parse as local date by extracting year/month/day
      const [startYear, startMonthNum, startDay] = propStartDate.split('-').map(Number);
      const [endYear, endMonthNum, endDay] = propEndDate.split('-').map(Number);
      startMonth = new Date(startYear, startMonthNum - 1, startDay);
      endMonth = new Date(endYear, endMonthNum - 1, endDay);
    } else {
      // Default: January 1st of current year to today (max Dec 31st)
      startMonth = new Date(thisYear, 0, 1); // January 1st
      // End at current date, but no later than December 31st of current year
      const dec31 = new Date(thisYear, 11, 31);
      endMonth = today <= dec31 ? today : dec31;
    }

    // Generate all months between start and end
    const current = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1);
    const end = new Date(endMonth.getFullYear(), endMonth.getMonth(), 1);

    while (current <= end) {
      const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
      allMonths.push(monthKey);
      current.setMonth(current.getMonth() + 1);
    }

    // Use all months for labels and data (fill with 0 if no expenses)
    const labels = allMonths.map((month) => {
      const [year, monthNum] = month.split('-');
      const date = new Date(Number(year), Number(monthNum) - 1);
      return date.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
    });
    const data = allMonths.map((month) => monthlyData[month] || 0);
    return { labels, data };
  }, [expenses, propStartDate, propEndDate, locale]);

  const lineData = useMemo(
    () => ({
      labels: trend.labels,
      datasets: [
        {
          label: t('charts.expenses'),
          data: trend.data,
          borderColor: chartColors.primary,
          backgroundColor: withAlpha(chartColors.primary, theme === 'dark' ? 0.18 : 0.12),
          pointBackgroundColor: chartColors.primary,
          pointRadius: 2.5,
          fill: true,
          tension: 0.4,
        },
      ],
    }),
    [trend, t, theme]
  );

  const lineOptions = useMemo<ChartOptions<'line'>>(() => {
    const base = getLineChartOptions(undefined, theme);
    const baseY = (base.scales?.y ?? {}) as Record<string, unknown> & { ticks?: Record<string, unknown> };
    return {
      ...base,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        ...base.plugins,
        legend: { display: false },
        tooltip: {
          ...base.plugins?.tooltip,
          displayColors: false,
          callbacks: {
            label: (context) => formatCurrency(context.parsed.y ?? 0),
          },
        },
      },
      scales: {
        ...base.scales,
        y: {
          ...baseY,
          beginAtZero: true,
          ticks: {
            ...baseY.ticks,
            callback: (value) => formatCurrency(Number(value)),
          },
        },
      },
    };
  }, [theme]);

  const formatCount = useCallback((value: number) => Math.round(value).toLocaleString(locale), [locale]);

  const columns: Column<Expense>[] = useMemo(() => [
    {
      key: 'date',
      accessorKey: 'expense_date',
      header: t('table.date'),
      render: (expense) => (
        <span className="whitespace-nowrap tabular-nums text-gray-700 dark:text-gray-300">
          {formatDate(expense.expense_date)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'description',
      accessorKey: 'description',
      header: t('table.description'),
      render: (expense) => (
        <div className="max-w-xs">
          <div className="truncate font-medium text-gray-900 dark:text-white">{expense.description}</div>
          {(expense.is_billable || expense.is_recurring || expense.parent_expense_id) && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {expense.is_billable && (
                <Badge variant="green" size="sm">
                  {t('fields.billable')}
                </Badge>
              )}
              {expense.is_recurring && (
                <Badge variant="brand" size="sm" icon={<Repeat className="h-3 w-3" aria-hidden="true" />}>
                  {t('recurring.recurring', 'Recurring')}
                </Badge>
              )}
              {expense.parent_expense_id && (
                <Badge variant="blue" size="sm">
                  {t('recurring.autoGenerated', 'Auto-generated')}
                </Badge>
              )}
            </div>
          )}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'category',
      accessorKey: 'category',
      header: t('table.category'),
      render: (expense) => (
        <span className="text-gray-600 dark:text-gray-400">
          {getCategoryLabel(expense.category)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'amount',
      accessorKey: 'amount',
      header: t('table.amount'),
      align: 'right',
      render: (expense) => (
        <span className="whitespace-nowrap font-semibold tabular-nums text-gray-900 dark:text-white">
          {formatCurrency(expense.amount, expense.currency)}
        </span>
      ),
      sortable: true,
      sortValue: (expense) => Number(expense.amount),
    },
    {
      key: 'depreciation',
      header: t('table.depreciation'),
      render: (expense) => (
        expense.depreciation_type === 'immediate' ? (
          <Badge variant="green" size="sm">
            {t('depreciation.immediateShort')}
          </Badge>
        ) : expense.depreciation_type === 'partial' ? (
          <Badge variant="amber" size="sm">
            {t('depreciation.yearsShort', { count: expense.depreciation_years ?? 0 })}
          </Badge>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">—</span>
        )
      ),
    },
    {
      key: 'taxDeductible',
      header: t('table.taxDeductible'),
      render: (expense) => (
        expense.tax_deductible_percentage !== null && expense.tax_deductible_percentage !== undefined ? (
          <Badge
            size="sm"
            variant={
              expense.tax_deductible_percentage === 100
                ? 'green'
                : expense.tax_deductible_percentage === 0
                ? 'red'
                : 'blue'
            }
          >
            <span className="tabular-nums">{expense.tax_deductible_percentage}%</span>
          </Badge>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">—</span>
        )
      ),
    },
    {
      key: 'receipt',
      header: t('table.receipt'),
      align: 'center',
      render: (expense) => (
        expense.receipt_url ? (
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/20"
            title={t('receipt.hasReceipt')}
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">{t('receipt.hasReceipt')}</span>
          </span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">—</span>
        )
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('table.actions')}</span>,
      align: 'right',
      render: (expense) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            openExpense(expense.id);
          }}
          className="text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
        >
          {t('table.view')}
        </Button>
      ),
    },
  ], [t, getCategoryLabel, formatDate]);

  const hasFilters = Boolean(searchTerm) || categoryFilter !== 'all';
  const showDepreciation =
    depreciationSummary && depreciationSummary.summary.total_assets_under_depreciation > 0;

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="section-title">{t('title')}</h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t('subtitle')}</p>
        </div>

        {activeTab === 'expense-list' && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => triggerRecurring.mutate()}
              disabled={triggerRecurring.isPending}
              title={t('syncRecurringTooltip')}
              leftIcon={
                <RefreshCw
                  className={cn('h-4 w-4', triggerRecurring.isPending && 'animate-spin')}
                  aria-hidden="true"
                />
              }
            >
              {triggerRecurring.isPending ? t('syncing') : t('syncRecurring')}
            </Button>
            <Button
              type="button"
              onClick={() => setShowExpenseModal(true)}
              leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            >
              {t('addExpense')}
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        variant="pills"
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as ExpensesTab)}
        tabs={[
          { id: 'expense-list', label: t('tabs.allExpenses'), icon: Receipt },
          { id: 'expense-recurring', label: t('tabs.recurring'), icon: Repeat },
        ]}
      />

      {/* Recurring templates */}
      <TabPanel tabId="expense-recurring" activeTab={activeTab}>
        <RecurringExpensesManager />
      </TabPanel>

      {/* All expenses */}
      <TabPanel tabId="expense-list" activeTab={activeTab} className="space-y-6">
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={cn(fieldClasses(), 'pl-9')}
              autoComplete="off"
            />
          </div>
          <div className="w-full sm:w-60">
            <CustomSelect
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categoryOptions}
              size="md"
            />
          </div>
          {/* Status filter hidden - not needed for solo freelancer (all expenses auto-approved) */}
        </div>

        {isLoading ? (
          <ExpensesSkeleton />
        ) : error ? (
          <Alert
            type="error"
            title={t('errorLoading')}
            message={error instanceof Error ? error.message : t('unknownError')}
          />
        ) : (
          <>
            {/* Summary */}
            {summary && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <StatCard
                    label={t('summary.totalExpenses')}
                    value={Number(summary.total_amount) || 0}
                    format={(value) => formatCurrency(value)}
                    icon={Wallet}
                    variant="orange"
                    hint={`${summary.total_expenses} ${t('summary.transactions')}`}
                  />
                  <StatCard
                    label={t('summary.monthlyAverage')}
                    value={monthlyAverage}
                    format={(value) => formatCurrency(value)}
                    icon={CalendarRange}
                    variant="blue"
                    hint={t('summary.monthlyAverageHint')}
                  />
                </div>

                {/* Category breakdown */}
                <Card className="lg:col-span-2">
                  <CardHeader title={t('charts.byCategory')} />
                  <CardBody className="py-5">
                    {sortedCategories.length > 0 && categoryTotal ? (
                      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
                        <div className="h-44 w-44 shrink-0">
                          <Doughnut data={doughnutData} options={doughnutOptions} />
                        </div>
                        <ul className="w-full min-w-0 flex-1 space-y-2">
                          {categorySlices.map((slice) => {
                            const percentage = (slice.total / categoryTotal) * 100;
                            return (
                              <li key={slice.key} className="text-sm">
                                <div className="flex items-center gap-3">
                                  <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: slice.color }}
                                    aria-hidden="true"
                                  />
                                  <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
                                    {slice.label}
                                  </span>
                                  <span className="whitespace-nowrap font-medium tabular-nums text-gray-900 dark:text-white">
                                    {formatCurrency(slice.total)}
                                  </span>
                                  <span className="w-12 whitespace-nowrap text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">
                                    {percentage.toFixed(1)}%
                                  </span>
                                </div>
                                {slice.members.length > 0 && (
                                  <p className="ml-[1.375rem] mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                    {slice.members.join(', ')}
                                  </p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : (
                      <EmptyState compact icon={PieChart} title={t('charts.noCategoryData')} />
                    )}
                  </CardBody>
                </Card>
              </div>
            )}

            {/* Expense trend */}
            <Card>
              <CardHeader title={t('charts.overTime')} />
              <CardBody className="py-5">
                {expenses.length === 0 ? (
                  <EmptyState compact icon={LineChart} title={t('charts.noData')} />
                ) : (
                  <div className="relative h-[280px]">
                    <Line data={lineData} options={lineOptions} />
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Depreciation (AfA) summary */}
            {showDepreciation && depreciationSummary && (
              <section className="space-y-3">
                <h3 className="section-title">
                  {t('depreciationSummary.title', { year: currentYear })}
                </h3>
                <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <StatCard
                    label={t('depreciationSummary.assets')}
                    value={Number(depreciationSummary.summary.total_assets_under_depreciation) || 0}
                    format={formatCount}
                    icon={Layers}
                    variant="brand"
                    hint={t('depreciationSummary.assetsHint')}
                  />
                  <StatCard
                    label={t('depreciationSummary.deductible', { year: currentYear })}
                    value={Number(depreciationSummary.summary.depreciation_amount || 0)}
                    format={(value) => formatCurrency(value)}
                    icon={Calculator}
                    variant="green"
                    hint={t('depreciationSummary.deductibleHint')}
                  />
                  <StatCard
                    label={t('depreciationSummary.remaining')}
                    value={Number(depreciationSummary.summary.deferred_amount || 0)}
                    format={(value) => formatCurrency(value)}
                    icon={Hourglass}
                    variant="yellow"
                    hint={t('depreciationSummary.remainingHint')}
                  />
                </div>
              </section>
            )}

            {/* Expenses table */}
            <Table
              data={expenses}
              columns={columns}
              pageSize={10}
              onRowClick={(expense) => openExpense(expense.id)}
              emptyMessage={
                <EmptyState
                  icon={Receipt}
                  title={t('noExpenses')}
                  description={hasFilters ? t('tryAdjustingFilters') : t('noExpensesMessage')}
                  action={
                    hasFilters ? undefined : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setShowExpenseModal(true)}
                        leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                      >
                        {t('addExpense')}
                      </Button>
                    )
                  }
                />
              }
            />
          </>
        )}
      </TabPanel>

      {/* Add Expense Modal */}
      <AddExpenseModal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        onExpenseAdded={() => refetch()}
      />

      {/* Expense Detail Modal */}
      {selectedExpenseId && (
        <ExpenseDetailModal
          key={detailSession}
          expenseId={selectedExpenseId}
          isOpen={detailOpen}
          onClose={() => setDetailOpen(false)}
          onExpenseUpdated={() => refetch()}
        />
      )}
    </div>
  );
}

/** Placeholder shaped like the summary, chart and table while expenses load. */
function ExpensesSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {[0, 1].map((i) => (
            <div key={i} className="surface p-5">
              <SkeletonItem className="h-4 w-28" />
              <SkeletonItem className="mt-3 h-7 w-36" />
              <SkeletonItem className="mt-2 h-3 w-20" />
            </div>
          ))}
        </div>
        <div className="surface flex items-center gap-6 p-6 lg:col-span-2">
          <SkeletonItem className="h-40 w-40 shrink-0 rounded-full" />
          <div className="flex-1 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonItem key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
      </div>
      <div className="surface p-6">
        <SkeletonItem className="h-5 w-40" />
        <SkeletonItem className="mt-5 h-56 w-full" />
      </div>
      <div className="surface divide-y divide-gray-100 dark:divide-gray-800">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <SkeletonItem className="h-4 w-24" />
            <SkeletonItem className="h-4 flex-1" />
            <SkeletonItem className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
