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

/**
 * Error Boundary Component
 * 
 * Displays error information and provides navigation options.
 */
const ErrorBoundary: React.FC = () => {
  const error = useRouteError();
  const { t } = useTranslation('errors');

  let errorMessage: string;
  let errorStatus: number | undefined;

  if (isRouteErrorResponse(error)) {
    // Error from a loader or action
    errorStatus = error.status;
    errorMessage = error.statusText || error.data?.message || 'An error occurred';
  } else if (error instanceof Error) {
    // JavaScript error
    errorMessage = error.message;
  } else {
    // Unknown error
    errorMessage = 'An unexpected error occurred';
  }

  // Determine error type
  const is404 = errorStatus === 404;
  const is403 = errorStatus === 403;
  const is500 = errorStatus === 500;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full text-center">
        {/* Error Icon */}
        <div className="mb-6">
          <svg
            className="mx-auto h-24 w-24 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Error Status */}
        {errorStatus && (
          <h1 className="text-6xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            {errorStatus}
          </h1>
        )}

        {/* Error Title */}
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {is404 && t('notFound')}
          {is403 && t('forbidden')}
          {is500 && t('serverError')}
          {!is404 && !is403 && !is500 && t('somethingWentWrong')}
        </h2>

        {/* Error Message */}
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          {errorMessage}
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
          >
            {t('goToDashboard')}
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 dark:border-gray-600 text-base font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
          >
            {t('goBack')}
          </button>
        </div>

        {/* Development Error Details */}
        {process.env.NODE_ENV === 'development' && error instanceof Error && (
          <details className="mt-8 text-left">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Error Details (Development Only)
            </summary>
            <pre className="text-xs text-left bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-auto max-h-64 text-red-600 dark:text-red-400">
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
};

export default ErrorBoundary;
