import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, RefreshCw } from 'lucide-react';

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
 * - Rose-colored alert styling for error indication
 * - AlertTriangle icon for visual emphasis
 * - Custom or default error message
 * - Optional retry button with RefreshCw icon
 * - Dark mode support
 * - Accessible with ARIA attributes
 * - Responsive padding and spacing
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
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-1 h-5 w-5" aria-hidden="true" />
        <div className="flex-1">
          <h3 className="text-base font-semibold">{t('dashboardLoadFailed')}</h3>
          <p className="mt-2 text-sm opacity-90">{message ?? t('checkConnection')}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
            >
              <RefreshCw className="h-4 w-4" /> {t('tryAgain')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
