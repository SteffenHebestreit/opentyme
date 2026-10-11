import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { useDashboard } from '../../hooks/api';
import { PageHeader } from '../common/PageHeader';
import { EmptyState } from '../common/EmptyState';
import { DashboardSection } from './DashboardSection';
import { MetricsGrid } from './MetricsGrid';
import { YearlyFinancialSummary } from './YearlyFinancialSummary';
import { RecentTimeEntries } from './RecentTimeEntries';
import { RecentInvoices } from './RecentInvoices';
import { QuickActions } from './QuickActions';
import { DashboardSkeleton } from './DashboardSkeleton';
import { DashboardErrorState } from './DashboardErrorState';
import TimeTrendChart from './charts/TimeTrendChart';
import RevenueByClientChart from './charts/RevenueByClientChart';
import ProjectTimeBudgets from './ProjectTimeBudgets';
import DepreciationScheduleChart from './charts/DepreciationScheduleChart';
import AssetRegisterTable from './AssetRegisterTable';
import { Slot } from '../../plugins/slots';

/**
 * Main Dashboard component displaying application overview and key metrics.
 *
 * Layout, top to bottom:
 * - Page header with personalized greeting and quick actions (log time, new invoice, …)
 * - Financial overview of the year: primary key figures + compact tax card
 * - "At a glance" metrics (projects, clients, hours, unpaid invoices, revenue)
 * - Analytics charts (time trend, top clients) and project time budgets
 * - Recent activity: time entries and invoices side by side
 * - Depreciation (AfA): schedule chart and asset register
 * - Addon-contributed widgets
 *
 * Key figures count up on load and highlight when they change after a save
 * elsewhere, so it is visible that the numbers are live. Shows a layout-shaped
 * skeleton while loading, an error state with retry, and a welcome message
 * when not authenticated.
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
      <EmptyState
        bordered
        icon={LayoutDashboard}
        title={t('welcome.title')}
        description={t('welcome.message')}
      />
    );
  }

  const userName = state.user?.username;

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('title')}
        subtitle={userName ? t('greeting', { name: userName }) : t('greetingNoName')}
        actions={<QuickActions />}
      />

      {isLoading ? (
        <DashboardSkeleton />
      ) : isError || !data ? (
        <DashboardErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
      ) : (
        <Fragment>
          {/* Primary: the year's financial key figures and tax-relevant overview */}
          <YearlyFinancialSummary />

          {/* Operational metrics */}
          <DashboardSection title={t('sections.atAGlance')}>
            <MetricsGrid metrics={data.metrics} />
          </DashboardSection>

          {/* Analytics Charts */}
          <DashboardSection title={t('analyticsInsights')}>
            <div className="grid gap-6 lg:grid-cols-2">
              <TimeTrendChart />
              <RevenueByClientChart />
            </div>
            <ProjectTimeBudgets />
          </DashboardSection>

          {/* Recent activity, side by side on wide screens */}
          <DashboardSection title={t('sections.recentActivity')}>
            <div className="grid gap-6 xl:grid-cols-5">
              <div className="min-w-0 xl:col-span-2">
                <RecentTimeEntries entries={data.recentTimeEntries} />
              </div>
              <div className="min-w-0 xl:col-span-3">
                <RecentInvoices invoices={data.recentInvoices} />
              </div>
            </div>
          </DashboardSection>

          {/* Depreciation Section */}
          <DashboardSection title={t('depreciation.title')}>
            <DepreciationScheduleChart />
            <AssetRegisterTable />
          </DashboardSection>

          {/* Addon-contributed dashboard widgets */}
          <Slot name="dashboard-widgets" context={{ metrics: data.metrics }} />
        </Fragment>
      )}
    </div>
  );
}
