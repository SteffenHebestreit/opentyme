import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, Timer, FilePlus2, Users } from 'lucide-react';
import clsx from 'clsx';

/**
 * Quick action button configuration.
 * 
 * @interface ActionButton
 * @property {string} label - Button text label
 * @property {string} description - Descriptive subtitle
 * @property {typeof Plus} icon - Lucide icon component
 * @property {string} to - Navigation path (supports query params for modals/wizards)
 * @property {'indigo' | 'emerald' | 'sky' | 'amber'} tone - Color theme
 */
interface ActionButton {
  label: string;
  description: string;
  icon: typeof Plus;
  to: string;
  tone: 'indigo' | 'emerald' | 'sky' | 'amber';
}

/**
 * Gradient color classes for action button borders.
 * Maps tone to Tailwind gradient classes.
 * 
 * @constant
 */
const toneClass: Record<ActionButton['tone'], string> = {
  indigo: 'from-indigo-500 via-indigo-500/90 to-indigo-500/80',
  emerald: 'from-emerald-500 via-emerald-500/90 to-emerald-500/80',
  sky: 'from-sky-500 via-sky-500/90 to-sky-500/80',
  amber: 'from-amber-500 via-amber-500/90 to-amber-500/80',
};

/**
 * Quick action buttons for common dashboard tasks.
 * 
 * Features:
 * - Four preset actions: Log Time, Add Client, Create Invoice, New Project
 * - Gradient border styling with hover effects
 * - Icon badges for visual identification
 * - Lift animation on hover (-translate-y-0.5)
 * - Navigation to specific routes with query params for modals/wizards
 * - Responsive 2-column grid
 * - Dark mode support
 * - Keyboard accessible with focus rings
 * 
 * Each button navigates to the appropriate page and can trigger modals or wizards
 * through query parameters (e.g., ?modal=new, ?wizard=start).
 * 
 * @component
 * @example
 * // Basic usage in Dashboard
 * <QuickActions />
 * 
 * @example
 * // Example navigation paths
 * // Log Time: /time-entries
 * // Add Client: /clients?modal=new (opens new client modal)
 * // Create Invoice: /invoices?wizard=start (starts invoice wizard)
 * // New Project: /projects?modal=new (opens new project modal)
 * 
 * @returns {JSX.Element} Grid of quick action buttons
 */
export const QuickActions: FC = () => {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();

  const actions: ActionButton[] = [
    {
      label: t('quickActions.logTime'),
      description: t('quickActions.logTimeDesc'),
      icon: Timer,
      to: '/time-entries',
      tone: 'indigo',
    },
    {
      label: t('quickActions.addClient'),
      description: t('quickActions.addClientDesc'),
      icon: Users,
      to: '/clients?modal=new',
      tone: 'emerald',
    },
    {
      label: t('quickActions.createInvoice'),
      description: t('quickActions.createInvoiceDesc'),
      icon: FilePlus2,
      to: '/invoices?wizard=start',
      tone: 'sky',
    },
    {
      label: t('quickActions.newProject'),
      description: t('quickActions.newProjectDesc'),
      icon: Plus,
      to: '/projects?modal=new',
      tone: 'amber',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.label}
            type="button"
            onClick={() => navigate(action.to)}
            className={clsx(
              'group relative overflow-hidden rounded-xl border border-transparent bg-gradient-to-r p-[1px] shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
              toneClass[action.tone]
            )}
          >
            <div className="flex h-full w-full items-center justify-between rounded-[11px] bg-white/95 p-4 text-left dark:bg-gray-950/80">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{action.label}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{action.description}</p>
              </div>
              <div className="rounded-full bg-white/30 p-2 text-gray-700 transition group-hover:scale-105 dark:bg-gray-900/60 dark:text-gray-200">
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
