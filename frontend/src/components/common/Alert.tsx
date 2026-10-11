import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

export type AlertType = 'info' | 'success' | 'warning' | 'error';

/**
 * Props for the Alert component.
 *
 * @property {string} message - Alert text
 * @property {AlertType} [type='info'] - Tone
 * @property {string} [title] - Bold first line
 * @property {() => void} [onClose] - Shows a dismiss button when given
 * @property {string} [closeLabel='Dismiss'] - Accessible label of that button (e.g. "Retry" when closing reloads)
 */
interface AlertProps {
  message: string;
  type?: AlertType;
  title?: string;
  onClose?: () => void;
  closeLabel?: string;
  className?: string;
}

const toneClasses: Record<AlertType, { box: string; icon: string; title: string }> = {
  info: {
    box: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200',
    icon: 'text-blue-500 dark:text-blue-400',
    title: 'text-blue-900 dark:text-blue-100',
  },
  success: {
    box: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200',
    icon: 'text-emerald-500 dark:text-emerald-400',
    title: 'text-emerald-900 dark:text-emerald-100',
  },
  warning: {
    box: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200',
    icon: 'text-amber-500 dark:text-amber-400',
    title: 'text-amber-900 dark:text-amber-100',
  },
  error: {
    box: 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200',
    icon: 'text-red-500 dark:text-red-400',
    title: 'text-red-900 dark:text-red-100',
  },
};

const icons: Record<AlertType, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

/**
 * Inline status message (info / success / warning / error).
 *
 * @example
 * <Alert type="error" title="Could not save" message={error} onClose={() => setError(null)} />
 */
export const Alert: React.FC<AlertProps> = ({
  message,
  type = 'info',
  title,
  onClose,
  closeLabel = 'Dismiss',
  className,
}) => {
  const tone = toneClasses[type];
  const Icon = icons[type];

  return (
    <div
      className={cn('flex animate-fade-in items-start gap-3 rounded-lg border p-3.5 text-sm', tone.box, className)}
      role="alert"
      data-type={type}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone.icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <h4 className={cn('font-medium', tone.title)}>{title}</h4>}
        <div className={cn(title && 'mt-0.5')}>{message}</div>
      </div>
      {onClose && (
        <button
          type="button"
          className="-m-1 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
          aria-label={closeLabel}
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

export const ErrorAlert: React.FC<Omit<AlertProps, 'type'>> = (props) => <Alert type="error" {...props} />;

export const SuccessAlert: React.FC<Omit<AlertProps, 'type'>> = (props) => <Alert type="success" {...props} />;
