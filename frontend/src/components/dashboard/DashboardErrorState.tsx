import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../common/Button';

/**
 * Props for the DashboardErrorState component.
 *
 * @interface DashboardErrorStateProps
 * @property {string} [message] - Custom error message (defaults to generic connection error)
 * @property {() => void} [onRetry] - Optional retry callback (if provided, shows retry button)
 */
interface DashboardErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

/**
 * Error state component for dashboard data loading failures.
 *
 * Features:
 * - Red tinted panel with an icon tile (light and dark mode)
 * - Custom or default error message
 * - Optional retry button
 * - Announced to screen readers (role="alert")
 *
 * Displayed when dashboard data fetch fails.
 * Provides user feedback and recovery option through retry functionality.
 *
 * @component
 * @example
 * // With default message and retry
 * <DashboardErrorState onRetry={() => refetch()} />
 *
 * @example
 * // With custom message
 * <DashboardErrorState
 *   message="Network timeout - please try again"
 *   onRetry={handleRetry}
 * />
 *
 * @example
 * // Without retry button
 * <DashboardErrorState message="Dashboard unavailable" />
 *
 * @param {DashboardErrorStateProps} props - Component props
 * @returns {JSX.Element} Error state with optional retry button
 */
export const DashboardErrorState: FC<DashboardErrorStateProps> = ({ message, onRetry }) => {
  const { t } = useTranslation('errors');

  return (
    <div
      role="alert"
      className="animate-fade-up rounded-xl border border-red-200 bg-red-50 p-5 sm:p-6 dark:border-red-500/20 dark:bg-red-500/10"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-red-600 ring-1 ring-inset ring-red-600/15 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-400/20">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-red-900 dark:text-red-100">{t('dashboardLoadFailed')}</h3>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300">{message ?? t('checkConnection')}</p>
          {onRetry ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-4"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={onRetry}
            >
              {t('tryAgain')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
