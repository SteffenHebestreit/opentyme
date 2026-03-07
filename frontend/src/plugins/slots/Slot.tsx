/**
 * Slot Component
 * 
 * Renders plugin components registered for a specific slot.
 * This is the injection point where addons can insert their UI components.
 */

import React from 'react';
import { useSlotProvider } from './SlotProvider';
import { SlotContext } from '../../types/plugin.types';

interface SlotProps {
  name: string;
  context?: SlotContext;
  fallback?: React.ReactNode;
  className?: string;
}

/**
 * Slot Component
 * 
 * Renders all plugin components registered for the specified slot name.
 * Components are rendered in order based on their order property.
 * 
 * @param name - The slot name (e.g., "expense-form-actions")
 * @param context - Optional context data passed to slot components
 * @param fallback - Optional fallback content if no components are registered
 * @param className - Optional CSS className for the wrapper
 * 
 * @example
 * ```tsx
 * <Slot name="expense-form-actions" context={{ expense, onUpdate }} />
 * ```
 */
export const Slot: React.FC<SlotProps> = ({ 
  name, 
  context = {}, 
  fallback = null,
  className 
}) => {
  const { getSlotComponents, hasSlotComponents } = useSlotProvider();

  // Get all components registered for this slot
  const components = getSlotComponents(name);

  // If no components are registered, show fallback
  if (!hasSlotComponents(name)) {
    return <>{fallback}</>;
  }

  return (
    <div className={className} data-slot={name}>
      {components.map((slotComponent, index) => {
        const Component = slotComponent.component;
        
        return (
          <React.Fragment key={`${slotComponent.pluginName}-${index}`}>
            <Component {...context} />
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default Slot;
