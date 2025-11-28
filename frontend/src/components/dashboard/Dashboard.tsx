import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../store/AppContext';
import { useDashboard } from '../../hooks/api';
import { MetricsGrid } from './MetricsGrid';
import { YearlyFinancialSummary } from './YearlyFinancialSummary';
import { RecentTimeEntries } from './RecentTimeEntries';
import { RecentInvoices } from './RecentInvoices';
import { QuickActions } from './QuickActions';
import { DashboardSkeleton } from './DashboardSkeleton';
import { DashboardErrorState } from './DashboardErrorState';
import TimeTrendChart from './charts/TimeTrendChart';
import RevenueByClientChart from './charts/RevenueByClientChart';
import DepreciationScheduleChart from './charts/DepreciationScheduleChart';
import AssetRegisterTable from './AssetRegisterTable';

/**
 * Main Dashboard component displaying application overview and key metrics.
 * 
 * Features:
 * - Personalized greeting with user name
 * - Metrics grid showing KPIs (projects, clients, hours, invoices, revenue)
 * - Weekly hours trend chart
 * - Recent time entries list
 * - Recent invoices list  
 * - Quick action buttons
 * - Loading skeleton during data fetch
 * - Error state with retry functionality
 * - Unauthenticated state with welcome message
 * - Dark mode support
 * 
 * Uses useDashboard hook to fetch aggregated dashboard data.
 * Uses AppContext to check authentication state and access user info.
 * 
 * @component
 * @example
 * // Basic usage in route
 * <Route path="/dashboard" element={
 *   <AuthGuard>
 *     <Dashboard />
 *   </AuthGuard>
 * } />
 * 
 * @returns {JSX.Element} Dashboard with metrics, charts, and recent activity
 */
export default function Dashboard() {
  const { t } = useTranslation('dashboard');
  const { state } = useApp();
  const { data, isLoading, isError, error, refetch } = useDashboard();

  if (!state.isAuthenticated) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-gray-700 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
          <h2 className="text-xl font-semibold">{t('welcome.title')}</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {t('welcome.message')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">{t('title')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('greeting', { name: state.user?.username ?? 'there' })}
        </p>
      </div>

      {isLoading ? (
        <DashboardSkeleton />
      ) : isError || !data ? (
        <DashboardErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
      ) : (
        <Fragment>
          {/* Yearly Financial Summary - Prominent at top */}
          <YearlyFinancialSummary />

          <MetricsGrid metrics={data.metrics} />

          {/* Analytics Charts */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('analyticsInsights')}</h2>
            <div className="grid gap-6 lg:grid-cols-2">
              <TimeTrendChart />
              <RevenueByClientChart />
            </div>
          </div>

          {/* Depreciation Section */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Abschreibungen (AfA)</h2>
            <div className="grid gap-6 lg:grid-cols-1">
              <DepreciationScheduleChart />
              <AssetRegisterTable />
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('recentTimeEntries.title')}</h2>
              <RecentTimeEntries entries={data.recentTimeEntries} />
            </div>
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('quickActions.title')}</h2>
              <QuickActions />
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('recentInvoices.title')}</h2>
            <RecentInvoices invoices={data.recentInvoices} />
          </div>
        </Fragment>
      )}
    </div>
  );
}
