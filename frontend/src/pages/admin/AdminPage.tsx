/**
 * @fileoverview Main admin page with tabbed interface for managing system configuration.
 * 
 * Provides centralized access to:
 * - Tax rate management
 * - Invoice text template management
 * 
 * Uses tab navigation for better UX and organization.
 * 
 * @module pages/admin/AdminPage
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import TaxRatesPage from './TaxRatesPage';
import InvoiceTemplatesPage from './InvoiceTemplatesPage';
import GeneralSettingsPage from './GeneralSettingsPage';

type AdminTab = 'general' | 'tax-rates' | 'invoice-templates';

/**
 * Main admin page component with tabbed interface.
 * 
 * Features:
 * - Tab navigation between admin sections
 * - Clean, consistent layout
 * - Proper z-index management for modals
 * - Dark mode support
 * 
 * @component
 * @example
 * <Route path="/admin" element={<AdminPage />} />
 * 
 * @returns {JSX.Element} Admin page with tab navigation
 */
export default function AdminPage() {
  const { t } = useTranslation('settings');
  const [activeTab, setActiveTab] = useState<AdminTab>('general');

  const tabs = [
    { id: 'general' as AdminTab, label: t('admin.tabs.general'), icon: '⚙️' },
    { id: 'tax-rates' as AdminTab, label: t('admin.tabs.taxRates'), icon: '💰' },
    { id: 'invoice-templates' as AdminTab, label: t('admin.tabs.templates'), icon: '📝' },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
          {t('admin.title')}
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {t('admin.subtitle')}
        </p>
      </div>

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8" aria-label="Configuration tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center space-x-2 whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
                  ${
                    activeTab === tab.id
                      ? 'border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'
                  }
                `}
                aria-current={activeTab === tab.id ? 'page' : undefined}
              >
                <span className="text-lg">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="relative">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            {activeTab === 'general' && <GeneralSettingsPage />}
            {activeTab === 'tax-rates' && <TaxRatesPage />}
            {activeTab === 'invoice-templates' && <InvoiceTemplatesPage />}
          </div>
        </div>
      </div>
  );
}
