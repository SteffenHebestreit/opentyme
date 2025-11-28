import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { DashboardMetrics } from '../../api/types';
import { Briefcase, Users, Clock3, FileWarning, DollarSign } from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency } from '../../utils/currency';

/**
 * Props for the MetricsGrid component.
 * 
 * @interface MetricsGridProps
 * @property {DashboardMetrics} metrics - Dashboard metrics data from API
 */
interface MetricsGridProps {
  metrics: DashboardMetrics;
}

/**
 * Responsive grid of dashboard metric cards displaying key performance indicators.
 * 
 * Features:
 * - Six metric cards: active projects, active clients, hours this week, outstanding invoices (count & total), revenue MTD
 * - Color-coded icon badges for visual distinction
 * - Custom formatters for hours (decimal) and currency values
 * - Hover effect with shadow transition
 * - Responsive grid: 1 column mobile, 2 columns tablet, 3 columns desktop
 * - Dark mode support
 * - Lucide React icons for visual consistency
 * 
 * Each card shows:
 * - Metric label (e.g., "Active Projects")
 * - Formatted value (e.g., "12" or "$1,234.56")
 * - Color-coded icon badge
 * 
 * @component
 * @example
 * // Basic usage with dashboard data
 * <MetricsGrid metrics={dashboardData.metrics} />
 * 
 * @example
 * // Example metrics structure
 * const metrics = {
 *   activeProjects: 8,
 *   activeClients: 5,
 *   hoursThisWeek: 32.5,
 *   outstandingInvoiceCount: 3,
 *   outstandingInvoiceTotal: 12500.00,
 *   revenueMonthToDate: 45000.00
 * };
 * <MetricsGrid metrics={metrics} />
 * 
 * @param {MetricsGridProps} props - Component props
 * @returns {JSX.Element} Grid of metric cards
 */
export const MetricsGrid: FC<MetricsGridProps> = ({ metrics }) => {
  const { t } = useTranslation('dashboard');

  const metricConfig: Array<{
    key: keyof DashboardMetrics;
    label: string;
    icon: FC<{ className?: string }>;
    accent: string;
    formatter?: (value: number) => string;
  }> = [
    {
      key: 'activeProjects',
      label: t('metrics.activeProjects'),
      icon: Briefcase,
      accent: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300',
    },
    {
      key: 'activeClients',
      label: t('metrics.totalClients'),
      icon: Users,
      accent: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    },
    {
      key: 'hoursThisWeek',
      label: t('metrics.hoursThisWeek'),
      icon: Clock3,
      accent: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
      formatter: (value: number) => `${value.toFixed(1)}h`,
    },
    {
      key: 'outstandingInvoiceCount',
      label: t('metrics.unpaidInvoices'),
      icon: FileWarning,
      accent: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
    },
    {
      key: 'outstandingInvoiceTotal',
      label: t('metrics.outstandingAmount'),
      icon: DollarSign,
      accent: 'bg-orange-500/10 text-orange-600 dark:text-orange-300',
      formatter: (value: number) => formatCurrency(value),
    },
    {
      key: 'revenueThisMonth',
      label: t('metrics.revenueThisMonth'),
      icon: DollarSign,
      accent: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
      formatter: (value: number) => formatCurrency(value),
    },
    {
      key: 'revenueLastMonth',
      label: t('metrics.revenueLastMonth'),
      icon: DollarSign,
      accent: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
      formatter: (value: number) => formatCurrency(value),
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {metricConfig.map(({ key, label, icon: Icon, accent, formatter }) => {
        const value = metrics[key];
        const displayValue = formatter ? formatter(value) : value.toLocaleString();

        return (
          <div
            key={key}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{displayValue}</p>
              </div>
              <span
                className={clsx(
                  'flex h-12 w-12 items-center justify-center rounded-full text-xl',
                  accent
                )}
              >
                <Icon className="h-6 w-6" />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
