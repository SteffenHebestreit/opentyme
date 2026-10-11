import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BrandMark } from '../../components/layout/BrandLogo';

/**
 * Props for the AuthCard component.
 *
 * @property {string} title - Page heading (rendered as the page's h1)
 * @property {ReactNode} [subtitle] - One line under the heading
 * @property {LucideIcon} [icon] - Shown in a small tile instead of the brand mark
 * @property {ReactNode} children - Card content (form, alerts, actions)
 * @property {ReactNode} [footer] - Content under the card (links, fine print)
 */
interface AuthCardProps {
  title: string;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Centered card used by the public auth pages (sign in, registration, password reset).
 * The public header and footer come from the layout, so this only frames the content.
 */
export function AuthCard({ title, subtitle, icon: Icon, children, footer }: AuthCardProps) {
  return (
    <div className="flex justify-center px-4 py-12 sm:py-20">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          {Icon ? (
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-purple-600 ring-1 ring-inset ring-purple-600/10 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-400/20">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
          ) : (
            <BrandMark className="h-11 w-11" />
          )}
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>

        <div className="surface p-6 sm:p-8">{children}</div>

        {footer && <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">{footer}</div>}
      </div>
    </div>
  );
}

/** Text-style button used for secondary links on the auth pages. */
export const authLinkClass =
  'rounded font-medium text-purple-600 transition-colors hover:text-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 dark:text-purple-400 dark:hover:text-purple-300';
