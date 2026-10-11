import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useToastStore, type ToastTone } from '../../lib/toast';

const toneIcon: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: 'text-emerald-500 dark:text-emerald-400' },
  error: { icon: XCircle, className: 'text-red-500 dark:text-red-400' },
  warning: { icon: AlertTriangle, className: 'text-amber-500 dark:text-amber-400' },
  info: { icon: Info, className: 'text-purple-500 dark:text-purple-400' },
};

/** Renders the toasts raised with `toast.*()`. Mount once, in the app shell. */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end sm:p-6"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((item) => {
        const { icon: Icon, className } = toneIcon[item.tone];
        return (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-gray-200 bg-white/95 p-3.5 pr-2.5 shadow-overlay backdrop-blur',
              'dark:border-gray-800 dark:bg-gray-900/95',
              item.leaving ? 'animate-slide-out-right' : 'animate-slide-in-right'
            )}
          >
            <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', className)} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.title}</p>
              {item.description && (
                <p className="mt-0.5 break-words text-sm text-gray-500 dark:text-gray-400">{item.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
