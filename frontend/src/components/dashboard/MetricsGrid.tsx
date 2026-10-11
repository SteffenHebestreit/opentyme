import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Briefcase, Clock3, FileWarning, HandCoins, TrendingUp, Users } from 'lucide-react';
import { DashboardMetrics } from '../../api/types';
import { formatCurrency } from '../../utils/currency';
import { AnimatedNumber } from '../common/AnimatedNumber';
import { StatCard } from '../common/StatCard';

/**
 * Props for the MetricsGrid component.
 *
 * @interface MetricsGridProps
 * @property {DashboardMetrics} metrics - Dashboard metrics data from API
 */
interface MetricsGridProps {
  metrics: DashboardMetrics;
}

const formatMoney = (value: number) => formatCurrency(value);
const formatCount = (value: number) => Math.round(value).toLocaleString();

/**
 * Dense grid of the day-to-day ("at a glance") metrics.
 *
 * Shows active projects, active clients, hours this week, unpaid invoices
 * (count and outstanding amount) and revenue this month — with last month's
 * revenue as the comparison underneath.
 *
 * Every value is a numeric StatCard value: it counts up on load and briefly
 * highlights when it changes, e.g. after a time entry is saved elsewhere.
 *
 * Responsive: 1 column on phones, 2 on tablets, 3 on desktops, 6 on very wide screens.
 *
 * @component
 * @example
 * <MetricsGrid metrics={dashboardData.metrics} />
 *
 * @param {MetricsGridProps} props - Component props
 * @returns {JSX.Element} Grid of metric cards
 */
export const MetricsGrid: FC<MetricsGridProps> = ({ metrics }) => {
  const { t, i18n } = useTranslation('dashboard');

  const formatHours = useMemo(() => {
    const formatter = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return (value: number) => `${formatter.format(value)} h`;
  }, [i18n.language]);

  return (
    <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      <StatCard
        label={t('metrics.activeProjects')}
        value={metrics.activeProjects}
        format={formatCount}
        icon={Briefcase}
        variant="indigo"
      />
      <StatCard
        label={t('metrics.totalClients')}
        value={metrics.activeClients}
        format={formatCount}
        icon={Users}
        variant="teal"
      />
      <StatCard
        label={t('metrics.hoursThisWeek')}
        value={metrics.hoursThisWeek}
        format={formatHours}
        icon={Clock3}
        variant="purple"
      />
      <StatCard
        label={t('metrics.unpaidInvoices')}
        value={metrics.outstandingInvoiceCount}
        format={formatCount}
        icon={FileWarning}
        variant="orange"
      />
      <StatCard
        label={t('metrics.outstandingAmount')}
        value={metrics.outstandingInvoiceTotal}
        format={formatMoney}
        icon={HandCoins}
        variant="yellow"
      />
      <StatCard
        label={t('metrics.revenueThisMonth')}
        value={metrics.revenueThisMonth}
        format={formatMoney}
        icon={TrendingUp}
        variant="green"
        hint={
          <>
            {t('metrics.lastMonth')}:{' '}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              <AnimatedNumber value={metrics.revenueLastMonth} format={formatMoney} />
            </span>
          </>
        }
      />
    </div>
  );
};
