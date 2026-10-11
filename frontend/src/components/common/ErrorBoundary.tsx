/**
 * @fileoverview Error Boundary component for React Router.
 *
 * Catches errors in route components and displays a user-friendly error page.
 *
 * @module components/common/ErrorBoundary
 */

import React from 'react';
import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, ChevronRight, LayoutDashboard, RotateCw, SearchX, ServerCrash, ShieldX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BrandLogo } from '../layout/BrandLogo';
import { Button } from './Button';
import { buttonClasses } from './buttonStyles';
import { cn } from '../../lib/cn';

/**
 * Error Boundary Component
 *
 * Displays error information and provides navigation options.
 * Rendered by the router instead of the whole layout, so it frames itself.
 */
const ErrorBoundary: React.FC = () => {
  const error = useRouteError();
  const { t } = useTranslation('errors');

  let errorMessage: string;
  let errorStatus: number | undefined;

  if (isRouteErrorResponse(error)) {
    // Error from a loader or action
    errorStatus = error.status;
    errorMessage = error.statusText || error.data?.message || t('routeError.responseFallback');
  } else if (error instanceof Error) {
    // JavaScript error
    errorMessage = error.message;
  } else {
    // Unknown error
    errorMessage = t('routeError.fallbackMessage');
  }

  // Determine error type
  const is404 = errorStatus === 404;
  const is403 = errorStatus === 403;
  const is500 = errorStatus === 500;

  const title = is404 ? t('notFound') : is403 ? t('forbidden') : is500 ? t('serverError') : t('somethingWentWrong');
  const description = is404
    ? t('notFoundPage.message')
    : is403
      ? t('forbiddenPage.message')
      : is500
        ? t('serverErrorPage.message')
        : t('routeError.generic');
  const Icon: LucideIcon = is404 ? SearchX : is403 ? ShieldX : is500 ? ServerCrash : AlertTriangle;
  const isClientIssue = is404 || is403;
  const showStack = process.env.NODE_ENV === 'development' && error instanceof Error && !!error.stack;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 px-4 dark:bg-gray-950">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center">
        <Link
          to="/dashboard"
          className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="OpenTYME"
        >
          <BrandLogo />
        </Link>
      </div>

      <main className="flex flex-1 items-center justify-center pb-16 pt-4">
        <div className="w-full max-w-md animate-fade-up">
          <div className="surface p-6 text-center sm:p-8">
            {/* Error Icon */}
            <span
              className={cn(
                'mx-auto flex h-12 w-12 items-center justify-center rounded-xl ring-1 ring-inset',
                isClientIssue
                  ? 'bg-brand-50 text-brand-600 ring-brand-600/10 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/20'
                  : 'bg-red-50 text-red-600 ring-red-600/15 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20'
              )}
            >
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>

            {/* Error Status */}
            {errorStatus && (
              <p className="mt-5 text-sm font-semibold tabular-nums text-brand-600 dark:text-brand-400">
                {t('routeError.errorCode', { status: errorStatus })}
              </p>
            )}

            {/* Error Title */}
            <h1
              className={cn(
                'text-xl font-semibold tracking-tight text-gray-900 dark:text-white',
                errorStatus ? 'mt-1' : 'mt-5'
              )}
            >
              {title}
            </h1>

            {/* Friendly explanation */}
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{description}</p>

            {/* Action Buttons */}
            <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
              <Button
                type="button"
                variant="ghost"
                onClick={() => window.history.back()}
                leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
              >
                {t('goBack')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => window.location.reload()}
                leftIcon={<RotateCw className="h-4 w-4" aria-hidden="true" />}
              >
                {t('routeError.reload')}
              </Button>
              <Link
                to="/dashboard"
                className={buttonClasses()}
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                {t('goToDashboard')}
              </Link>
            </div>
          </div>

          {/* Error details — collapsed, for debugging */}
          <details className="group mt-4 rounded-xl border border-gray-200 bg-white/60 text-left dark:border-gray-800 dark:bg-gray-900/50">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 transition-transform duration-200 group-open:rotate-90" aria-hidden="true" />
              {t('routeError.details')}
            </summary>
            <div className="space-y-3 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
              <p className="break-words font-mono text-xs text-gray-700 dark:text-gray-300">
                {errorStatus ? `${errorStatus} · ` : ''}
                {errorMessage}
              </p>
              {/* Development Error Details */}
              {showStack && (
                <div>
                  <p className="eyebrow mb-1.5">{t('routeError.stack')}</p>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-red-600 dark:bg-gray-950 dark:text-red-400">
                    {(error as Error).stack}
                  </pre>
                </div>
              )}
            </div>
          </details>
        </div>
      </main>
    </div>
  );
};

export default ErrorBoundary;
