/**
 * Plugin Registry
 * 
 * Central registry for managing loaded plugins, their state, and metadata.
 * Provides access to plugin instances and their configuration.
 */

import { Plugin, AddonManifest } from '../types/plugin.types';
import { logger } from '../utils/logger';

class PluginRegistry {
  private plugins: Map<string, Plugin> = new Map();
  private enabledPlugins: Set<string> = new Set();

  /**
   * Register a plugin in the registry
   */
  register(plugin: Plugin): void {
    const { name } = plugin.manifest;
    
    if (this.plugins.has(name)) {
      logger.warn(`Plugin ${name} is already registered. Overwriting.`);
    }

    this.plugins.set(name, plugin);
    
    if (plugin.enabled) {
      this.enabledPlugins.add(name);
    }

    logger.info(`Plugin registered: ${name} v${plugin.manifest.version}`);
  }

  /**
   * Unregister a plugin from the registry
   */
  unregister(pluginName: string): boolean {
    const removed = this.plugins.delete(pluginName);
    this.enabledPlugins.delete(pluginName);
    
    if (removed) {
      logger.info(`Plugin unregistered: ${pluginName}`);
    }
    
    return removed;
  }

  /**
   * Get a specific plugin by name
   */
  getPlugin(pluginName: string): Plugin | undefined {
    return this.plugins.get(pluginName);
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all enabled plugins
   */
  getEnabledPlugins(): Plugin[] {
    return Array.from(this.enabledPlugins)
      .map(name => this.plugins.get(name))
      .filter((p): p is Plugin => p !== undefined);
  }

  /**
   * Check if a plugin is registered
   */
  hasPlugin(pluginName: string): boolean {
    return this.plugins.has(pluginName);
  }

  /**
   * Check if a plugin is enabled
   */
  isPluginEnabled(pluginName: string): boolean {
    return this.enabledPlugins.has(pluginName);
  }

  /**
   * Enable a plugin
   */
  enablePlugin(pluginName: string): boolean {
    const plugin = this.plugins.get(pluginName);
    
    if (!plugin) {
      logger.error(`Cannot enable plugin ${pluginName}: not found`);
      return false;
    }

    plugin.enabled = true;
    this.enabledPlugins.add(pluginName);
    logger.info(`Plugin enabled: ${pluginName}`);
    
    return true;
  }

  /**
   * Disable a plugin
   */
  disablePlugin(pluginName: string): boolean {
    const plugin = this.plugins.get(pluginName);
    
    if (!plugin) {
      logger.error(`Cannot disable plugin ${pluginName}: not found`);
      return false;
    }

    plugin.enabled = false;
    this.enabledPlugins.delete(pluginName);
    logger.info(`Plugin disabled: ${pluginName}`);
    
    return true;
  }

  /**
   * Get plugin count
   */
  getPluginCount(): number {
    return this.plugins.size;
  }

  /**
   * Get enabled plugin count
   */
  getEnabledPluginCount(): number {
    return this.enabledPlugins.size;
  }

  /**
   * Get all plugin names
   */
  getPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get plugin manifest by name
   */
  getManifest(pluginName: string): AddonManifest | undefined {
    return this.plugins.get(pluginName)?.manifest;
  }

  /**
   * Clear all plugins (useful for testing)
   */
  clear(): void {
    this.plugins.clear();
    this.enabledPlugins.clear();
    logger.info('Plugin registry cleared');
  }
}

// Export singleton instance
export const pluginRegistry = new PluginRegistry();
