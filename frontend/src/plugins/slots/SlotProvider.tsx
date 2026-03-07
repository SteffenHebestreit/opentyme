/**
 * Slot Provider
 * 
 * React context provider for the slot injection system.
 * Manages slot registrations and provides slot components to the application.
 */

import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { frontendPluginRegistry } from '../plugin-registry';
import { LoadedSlotComponent, SlotContext } from '../../types/plugin.types';
import { usePlugins } from '../../api/hooks/usePlugins';

interface SlotProviderContextType {
  getSlotComponents: (slotName: string) => LoadedSlotComponent[];
  hasSlotComponents: (slotName: string) => boolean;
}

const SlotProviderContext = createContext<SlotProviderContextType | undefined>(undefined);

interface SlotProviderProps {
  children: ReactNode;
}

/**
 * Slot Provider Component
 * Wraps the application to provide slot functionality
 */
export const SlotProvider: React.FC<SlotProviderProps> = ({ children }) => {
  const { data: pluginsData } = usePlugins();

  // Set of user-enabled plugin names. null = data not yet loaded = show all.
  const userEnabledSet = useMemo(() => {
    if (!pluginsData?.plugins) return null;
    return new Set(pluginsData.plugins.filter((p) => p.userEnabled).map((p) => p.name));
  }, [pluginsData]);

  const getSlotComponents = (slotName: string): LoadedSlotComponent[] => {
    const all = frontendPluginRegistry.getSlotComponents(slotName);
    if (!userEnabledSet) return all;
    return all.filter((c) => userEnabledSet.has(c.pluginName));
  };

  const hasSlotComponents = (slotName: string): boolean => {
    return getSlotComponents(slotName).length > 0;
  };

  const value: SlotProviderContextType = {
    getSlotComponents,
    hasSlotComponents,
  };

  return (
    <SlotProviderContext.Provider value={value}>
      {children}
    </SlotProviderContext.Provider>
  );
};

/**
 * Hook to access slot provider context
 */
export const useSlotProvider = (): SlotProviderContextType => {
  const context = useContext(SlotProviderContext);
  
  if (!context) {
    throw new Error('useSlotProvider must be used within a SlotProvider');
  }
  
  return context;
};
