/**
 * Frontend Plugin Loader
 *
 * Discovers and loads frontend plugins from the plugins directory.
 * Uses Vite's import.meta.glob for static analysis-friendly dynamic imports.
 */

import { FrontendPlugin, FrontendAddonManifest, LoadedSlotComponent, AddonFrontendPlugin } from '../types/plugin.types';
import { frontendPluginRegistry } from './plugin-registry';

class FrontendPluginLoader {
  private loaded: boolean = false;
  private pluginModules: Record<string, any> = {};

  /**
   * Load all plugins from the plugins directory
   */
  async loadAll(): Promise<void> {
    if (this.loaded) {
      console.warn('[Plugin] Plugins already loaded. Skipping reload.');
      return;
    }

    console.info('[Plugin] Starting plugin discovery and loading...');

    try {
      const pluginCount = await this.discoverAndLoadPlugins();

      this.loaded = true;
      console.info(`[Plugin] Loading complete. ${pluginCount} plugin(s) loaded.`);
    } catch (error: any) {
      console.error('[Plugin] Error during plugin loading:', error.message);
      throw error;
    }
  }

  /**
   * Discover and load plugins using Vite's glob import.
   * Scans src/plugins/*\/addon-manifest.json and src/plugins/*\/index.ts
   */
  private async discoverAndLoadPlugins(): Promise<number> {
    // Use Vite's import.meta.glob for static analysis-friendly discovery
    const manifests = import.meta.glob<{ default: FrontendAddonManifest }>(
      './**/addon-manifest.json',
      { eager: true }
    );
    const modules = import.meta.glob<{ default: AddonFrontendPlugin; plugin?: AddonFrontendPlugin }>(
      './**/index.ts'
    );

    let loadedCount = 0;

    for (const [manifestPath, manifestModule] of Object.entries(manifests)) {
      const manifest = (manifestModule as any).default ?? (manifestModule as any);
      if (!manifest?.name) continue;

      const pluginName = this.extractPluginName(manifestPath);
      if (!pluginName) continue;

      // Skip if no frontend routes or slots declared in manifest
      if (!manifest.frontend?.routes?.length && !manifest.frontend?.slots?.length) continue;

      // Find matching module loader
      const modulePath = `./${pluginName}/index.ts`;
      const moduleLoader = modules[modulePath];

      if (!moduleLoader) {
        console.warn(`[Plugin] No index.ts found for plugin: ${pluginName}`);
        continue;
      }

      try {
        await this.loadPlugin(pluginName, manifest, moduleLoader);
        loadedCount++;
      } catch (error: any) {
        console.error(`[Plugin] Failed to load plugin ${pluginName}:`, error.message);
      }
    }

    return loadedCount;
  }

  /**
   * Load a single plugin given its manifest and module loader
   */
  async loadPlugin(
    pluginName: string,
    manifest: FrontendAddonManifest,
    moduleLoader: () => Promise<{ default: AddonFrontendPlugin; plugin?: AddonFrontendPlugin }>
  ): Promise<void> {
    console.info(`[Plugin] Loading: ${manifest.name} v${manifest.version}`);

    const pluginModule = await moduleLoader();
    const addonPlugin: AddonFrontendPlugin = pluginModule.default || pluginModule.plugin!;

    if (!addonPlugin) {
      throw new Error(`Plugin module for ${pluginName} does not export a default plugin object`);
    }

    if (addonPlugin.initialize) {
      await addonPlugin.initialize();
    }

    // Stamp each route with the plugin name so the Header can filter by userEnabled
    const routes = (addonPlugin.routes || []).map((r) => ({ ...r, pluginName: manifest.name }));

    const plugin: FrontendPlugin = {
      manifest,
      enabled: true,
      routes,
      slots: new Map(),
    };

    if (addonPlugin.slots) {
      Object.entries(addonPlugin.slots).forEach(([slotName, component]) => {
        const slotConfig = manifest.frontend?.slots?.find(s => s.name === slotName);
        const order = slotConfig?.order ?? 100;

        const slotComponent: LoadedSlotComponent = {
          pluginName: manifest.name,
          component,
          order,
        };

        const existing = plugin.slots.get(slotName) || [];
        plugin.slots.set(slotName, [...existing, slotComponent]);
      });
    }

    frontendPluginRegistry.register(plugin);
    this.pluginModules[pluginName] = pluginModule;
  }

  /**
   * Extract plugin name from a glob path like ./ai-expense-analysis/addon-manifest.json
   */
  private extractPluginName(manifestPath: string): string {
    const match = manifestPath.match(/^\.\/([^/]+)\//);
    return match ? match[1] : '';
  }

  /**
   * Check if plugins are loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Reload all plugins (useful for development)
   */
  async reload(): Promise<void> {
    console.info('[Plugin] Reloading all plugins...');
    frontendPluginRegistry.clear();
    this.pluginModules = {};
    this.loaded = false;
    await this.loadAll();
  }

  /**
   * Get loaded plugin module
   */
  getPluginModule(pluginName: string): any {
    return this.pluginModules[pluginName];
  }
}

// Export singleton instance
export const frontendPluginLoader = new FrontendPluginLoader();
