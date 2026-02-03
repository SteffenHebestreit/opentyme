import React, { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

/**
 * Individual tab definition.
 * 
 * @interface Tab
 * @property {string} id - Unique tab identifier
 * @property {string} label - Tab label text
 * @property {LucideIcon} [icon] - Optional icon component
 * @property {number} [badge] - Optional badge count
 */
export interface Tab {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: number;
}

/**
 * Props for the Tabs component.
 * 
 * @interface TabsProps
 * @property {Tab[]} tabs - Array of tab definitions
 * @property {string} activeTab - Currently active tab id
 * @property {(tabId: string) => void} onChange - Callback when tab is changed
 * @property {string} [className] - Additional CSS classes
 */
interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

/**
 * Reusable tabs component for tabbed navigation.
 * 
 * Features:
 * - Clean tab interface with border bottom
 * - Active state highlighting with colored border
 * - Optional icons for each tab
 * - Optional badge counts
 * - Hover states
 * - Keyboard navigation support
 * - Dark mode support
 * - Responsive design
 * 
 * @component
 * @example
 * // Basic tabs
 * const tabs = [
 *   { id: 'overview', label: 'Overview' },
 *   { id: 'settings', label: 'Settings' },
 * ];
 * 
 * <Tabs 
 *   tabs={tabs} 
 *   activeTab={activeTab} 
 *   onChange={setActiveTab} 
 * />
 * 
 * @example
 * // Tabs with icons and badges
 * const tabs = [
 *   { id: 'backups', label: 'Backups', icon: Database, badge: 5 },
 *   { id: 'schedules', label: 'Schedules', icon: Calendar },
 * ];
 * 
 * <Tabs 
 *   tabs={tabs} 
 *   activeTab={activeTab} 
 *   onChange={setActiveTab} 
 * />
 * 
 * @param {TabsProps} props - Component props
 * @returns {JSX.Element} Tabs navigation element
 */
export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = '',
}) => {
  return (
    <div className={`border-b border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="flex space-x-8">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                isActive
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`${tab.id}-panel`}
            >
              <span className="flex items-center gap-2">
                {Icon && <Icon className="w-5 h-5" />}
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={`ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    isActive
                      ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Props for the TabPanel component.
 * 
 * @interface TabPanelProps
 * @property {string} tabId - Tab identifier
 * @property {string} activeTab - Currently active tab id
 * @property {ReactNode} children - Panel content
 * @property {string} [className] - Additional CSS classes
 */
interface TabPanelProps {
  tabId: string;
  activeTab: string;
  children: ReactNode;
  className?: string;
}

/**
 * Tab panel component for tab content.
 * 
 * Only displays content when the corresponding tab is active.
 * 
 * @component
 * @example
 * <TabPanel tabId="overview" activeTab={activeTab}>
 *   <h2>Overview Content</h2>
 * </TabPanel>
 * 
 * @param {TabPanelProps} props - Component props
 * @returns {JSX.Element | null} Tab panel element or null if inactive
 */
export const TabPanel: React.FC<TabPanelProps> = ({
  tabId,
  activeTab,
  children,
  className = '',
}) => {
  if (tabId !== activeTab) return null;

  return (
    <div
      role="tabpanel"
      id={`${tabId}-panel`}
      aria-labelledby={tabId}
      className={className}
    >
      {children}
    </div>
  );
};
