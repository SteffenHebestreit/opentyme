/**
 * @fileoverview Main admin page with tabbed interface for managing system configuration.
 *
 * Provides centralized access to:
 * - Tax rate management
 * - Invoice text template management
 * - Plugin management
 * - Addon-injected settings tabs (via slot)
 *
 * @module pages/admin/AdminPage
 */

import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import TaxRatesPage from './TaxRatesPage';
import InvoiceTemplatesPage from './InvoiceTemplatesPage';
import GeneralSettingsPage from './GeneralSettingsPage';
import PluginsPage from './PluginsPage';
import EmailSettingsPage from './EmailSettingsPage';
import ThemeSettingsPage from './ThemeSettingsPage';
import EmailTemplatesPage from '../email-templates/EmailTemplatesPage';
import { Slot } from '@/plugins/slots';
import { frontendPluginRegistry } from '@/plugins/plugin-registry';

type CoreTab = 'general' | 'tax-rates' | 'invoice-templates' | 'email-templates' | 'email' | 'theme' | 'plugins';

/**
 * Main admin page component with tabbed interface.
 * Addons can inject additional tabs via the "settings-tabs" slot.
 */
export default function AdminPage() {
  const { t } = useTranslation('settings');
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const activeTab = tab || 'general';
  const setActiveTab = (id: string) => navigate(`/config/${id}`);

  const coreTabs = [
    { id: 'general' as CoreTab, label: t('admin.tabs.general'), icon: '⚙️' },
    { id: 'tax-rates' as CoreTab, label: t('admin.tabs.taxRates'), icon: '💰' },
    { id: 'invoice-templates' as CoreTab, label: t('admin.tabs.templates'), icon: '📝' },
    { id: 'email-templates' as CoreTab, label: t('admin.tabs.emailTemplates'), icon: '✉️' },
    { id: 'email' as CoreTab, label: t('admin.tabs.email'), icon: '📧' },
    { id: 'theme' as CoreTab, label: t('admin.tabs.theme'), icon: '🎨' },
    { id: 'plugins' as CoreTab, label: 'Addons', icon: '🧩' },
  ];

  // Collect addon-contributed tab metadata from slot components
  // Each slot component may expose a static `tabMeta` property: { id, label, icon }
  const addonTabMetas: Array<{ id: string; label: string; icon?: string }> =
    frontendPluginRegistry
      .getSlotComponents('settings-tabs')
      .map((sc) => {
        const meta = (sc.component as any).tabMeta;
        return meta ? { id: meta.id, label: meta.label, icon: meta.icon } : null;
      })
      .filter(Boolean) as Array<{ id: string; label: string; icon?: string }>;

  const allTabs = [...coreTabs, ...addonTabMetas];

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
        <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Configuration tabs">
          {allTabs.map((tab) => (
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
              {tab.icon && <span className="text-lg">{tab.icon}</span>}
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
          {activeTab === 'email-templates' && <EmailTemplatesPage />}
          {activeTab === 'email' && <EmailSettingsPage />}
          {activeTab === 'theme' && <ThemeSettingsPage />}
          {activeTab === 'plugins' && <PluginsPage />}

          {/* Addon-injected settings tabs (settings-tabs slot) */}
          <Slot
            name="settings-tabs"
            context={{ activeTab }}
          />
        </div>
      </div>
    </div>
  );
}
