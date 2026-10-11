/**
 * @fileoverview Main admin page with tabbed interface for managing system configuration.
 *
 * Provides centralized access to:
 * - Tax rate management
 * - Invoice text template management
 * - Plugin management
 * - Addon-injected settings tabs (via slot)
 *
 * The active tab lives in the URL (`/config/:tab`). Wide screens get a sticky
 * vertical sub-navigation, narrow screens a horizontally scrolling tab bar.
 *
 * @module pages/admin/AdminPage
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  Blocks,
  FileText,
  LayoutTemplate,
  Palette,
  Percent,
  Puzzle,
  Send,
  Settings2,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import TaxRatesPage from './TaxRatesPage';
import InvoiceTemplatesPage from './InvoiceTemplatesPage';
import GeneralSettingsPage from './GeneralSettingsPage';
import PluginsPage from './PluginsPage';
import EmailSettingsPage from './EmailSettingsPage';
import ThemeSettingsPage from './ThemeSettingsPage';
import EmailTemplatesPage from '../email-templates/EmailTemplatesPage';
import { Slot } from '@/plugins/slots';
import { frontendPluginRegistry } from '@/plugins/plugin-registry';
import { PageHeader } from '@/components/common/PageHeader';
import { Tabs } from '@/components/common/Tabs';
import { cn } from '@/lib/cn';

type CoreTab = 'general' | 'tax-rates' | 'invoice-templates' | 'email-templates' | 'email' | 'theme' | 'plugins';

interface NavTab {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  id: string;
  label: string;
  tabs: NavTab[];
}

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
  const mobileTabsRef = useRef<HTMLDivElement>(null);

  // Keep the active tab visible in the horizontally scrolling bar (narrow screens)
  useEffect(() => {
    const scroller = mobileTabsRef.current?.firstElementChild as HTMLElement | null;
    const button = scroller?.querySelector<HTMLElement>(`[data-tab-id="${activeTab}"]`);
    if (!scroller || !button || scroller.clientWidth === 0) return;
    scroller.scrollLeft = button.offsetLeft - (scroller.clientWidth - button.offsetWidth) / 2;
  }, [activeTab]);

  const coreTabs: Record<CoreTab, NavTab> = {
    general: { id: 'general', label: t('admin.tabs.general'), icon: SlidersHorizontal },
    'tax-rates': { id: 'tax-rates', label: t('admin.tabs.taxRates'), icon: Percent },
    'invoice-templates': { id: 'invoice-templates', label: t('admin.tabs.templates'), icon: FileText },
    'email-templates': { id: 'email-templates', label: t('admin.tabs.emailTemplates'), icon: LayoutTemplate },
    email: { id: 'email', label: t('admin.tabs.email'), icon: Send },
    theme: { id: 'theme', label: t('admin.tabs.theme'), icon: Palette },
    plugins: { id: 'plugins', label: t('admin.tabs.plugins'), icon: Puzzle },
  };

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

  // Addon icons are free-form strings (often emoji); show one consistent icon instead
  const addonTabs: NavTab[] = addonTabMetas.map((meta) => ({ id: meta.id, label: meta.label, icon: Blocks }));

  const groups: NavGroup[] = [
    {
      id: 'business',
      label: t('admin.navGroups.business'),
      tabs: [coreTabs.general, coreTabs['tax-rates'], coreTabs['invoice-templates']],
    },
    {
      id: 'communication',
      label: t('admin.navGroups.communication'),
      tabs: [coreTabs['email-templates'], coreTabs.email],
    },
    {
      id: 'appearance',
      label: t('admin.navGroups.appearance'),
      tabs: [coreTabs.theme],
    },
    {
      id: 'extensions',
      label: t('admin.navGroups.extensions'),
      tabs: [coreTabs.plugins, ...addonTabs],
    },
  ];

  const allTabs = groups.flatMap((group) => group.tabs);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.title')}
        subtitle={t('admin.subtitle')}
        icon={Settings2}
      />

      {/* Narrow screens: horizontal, scrollable tab bar */}
      <div ref={mobileTabsRef} className="lg:hidden">
        <Tabs
          tabs={allTabs}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        {/* Wide screens: sticky vertical sub-navigation */}
        <nav
          className="hidden w-56 shrink-0 lg:sticky lg:top-20 lg:block"
          aria-label={t('admin.navLabel')}
        >
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.id}>
                <p className="eyebrow mb-1.5 px-3">{group.label}</p>
                <ul className="space-y-0.5">
                  {group.tabs.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <li key={item.id}>
                        <Link
                          to={`/config/${item.id}`}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                            isActive
                              ? 'bg-white text-gray-900 shadow-soft ring-1 ring-gray-200 dark:bg-white/[0.06] dark:text-white dark:shadow-none dark:ring-white/10'
                              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.04] dark:hover:text-gray-100'
                          )}
                        >
                          {isActive && (
                            <span
                              aria-hidden="true"
                              className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-600 dark:bg-brand-400"
                            />
                          )}
                          <Icon
                            className={cn(
                              'h-4 w-4 shrink-0 transition-colors',
                              isActive
                                ? 'text-brand-600 dark:text-brand-400'
                                : 'text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300'
                            )}
                            aria-hidden="true"
                          />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* Tab Content */}
        <div key={activeTab} id={`${activeTab}-panel`} className="min-w-0 flex-1 animate-fade-in">
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
