/**
 * Frontend Plugin Registry
 * 
 * Central registry for managing loaded frontend plugins, their routes, and slots.
 */

import { FrontendPlugin, LoadedRoute, LoadedSlotComponent } from '../types/plugin.types';

class FrontendPluginRegistry {
  private plugins: Map<string, FrontendPlugin> = new Map();
  private slotComponents: Map<string, LoadedSlotComponent[]> = new Map();
  private routes: LoadedRoute[] = [];

  /**
   * Register a plugin in the registry
   */
  register(plugin: FrontendPlugin): void {
    const { name } = plugin.manifest;
    
    if (this.plugins.has(name)) {
      console.warn(`Plugin ${name} is already registered. Overwriting.`);
    }

    this.plugins.set(name, plugin);
    
    // Register routes
    this.routes.push(...plugin.routes);
    
    // Register slot components
    plugin.slots.forEach((components, slotName) => {
      const existing = this.slotComponents.get(slotName) || [];
      this.slotComponents.set(slotName, [...existing, ...components]);
      
      // Sort by order
      const sorted = this.slotComponents.get(slotName)!.sort((a, b) => a.order - b.order);
      this.slotComponents.set(slotName, sorted);
    });

    console.info(`[Plugin] Registered: ${name} v${plugin.manifest.version}`);
  }

  /**
   * Unregister a plugin from the registry
   */
  unregister(pluginName: string): boolean {
    const plugin = this.plugins.get(pluginName);
    
    if (!plugin) {
      return false;
    }

    // Remove routes
    this.routes = this.routes.filter(route => 
      !plugin.routes.includes(route)
    );
    
    // Remove slot components
    this.slotComponents.forEach((components, slotName) => {
      const filtered = components.filter(comp => comp.pluginName !== pluginName);
      if (filtered.length === 0) {
        this.slotComponents.delete(slotName);
      } else {
        this.slotComponents.set(slotName, filtered);
      }
    });

    this.plugins.delete(pluginName);
    console.info(`[Plugin] Unregistered: ${pluginName}`);
    
    return true;
  }

  /**
   * Get a specific plugin by name
   */
  getPlugin(pluginName: string): FrontendPlugin | undefined {
    return this.plugins.get(pluginName);
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): FrontendPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all routes from all plugins
   */
  getAllRoutes(): LoadedRoute[] {
    return [...this.routes];
  }

  /**
   * Get components for a specific slot
   */
  getSlotComponents(slotName: string): LoadedSlotComponent[] {
    return this.slotComponents.get(slotName) || [];
  }

  /**
   * Get all slot names
   */
  getAllSlotNames(): string[] {
    return Array.from(this.slotComponents.keys());
  }

  /**
   * Check if a plugin is registered
   */
  hasPlugin(pluginName: string): boolean {
    return this.plugins.has(pluginName);
  }

  /**
   * Get plugin count
   */
  getPluginCount(): number {
    return this.plugins.size;
  }

  /**
   * Clear all plugins (useful for testing)
   */
  clear(): void {
    this.plugins.clear();
    this.slotComponents.clear();
    this.routes = [];
    console.info('[Plugin] Registry cleared');
  }
}

// Export singleton instance
export const frontendPluginRegistry = new FrontendPluginRegistry();
