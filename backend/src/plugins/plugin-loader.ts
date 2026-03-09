/**
 * Plugin Loader
 *
 * Responsible for discovering, loading, and initializing plugins.
 * Scans the plugins directory, validates manifests, checks version compatibility,
 * and registers plugin routes and services.
 *
 * Automatically:
 * - Runs SQL migrations declared in the manifest
 * - Applies Keycloak auth middleware to all plugin routes
 */

import fs from 'fs';
import path from 'path';
import { Router, Application } from 'express';
import { AddonManifest, Plugin, PluginContext, AddonPlugin, AIContext } from '../types/plugin.types';
import { pluginRegistry } from './plugin-registry';
import { logger } from '../utils/logger';
import { pool } from '../utils/database';
import { authenticateKeycloak, extractKeycloakUser } from '../middleware/auth/keycloak.middleware';
import { registerCustomTool } from '../services/ai/ai-tool-registry.service';
import { registerSystemPromptExtension } from '../services/ai/system-prompt-registry.service';
import semver from 'semver';

// Current OpenTYME version for compatibility checking
const OPENTYME_VERSION = '1.0.0';

class PluginLoader {
  private pluginsDir: string;
  private loaded: boolean = false;

  constructor(pluginsDir?: string) {
    this.pluginsDir = pluginsDir || path.join(__dirname);
  }

  /**
   * Load all plugins from the plugins directory
   */
  async loadAll(app: Application): Promise<void> {
    if (this.loaded) {
      logger.warn('Plugins already loaded. Skipping reload.');
      return;
    }

    logger.info('Starting plugin discovery and loading...');

    try {
      const pluginDirs = this.discoverPlugins();
      logger.info(`Found ${pluginDirs.length} potential plugin(s)`);

      const aiContext: AIContext = {
        registerTool: (tool) => registerCustomTool(tool),
        registerSystemPromptExtension: (name, text) => registerSystemPromptExtension(name, text),
      };

      const context: PluginContext = {
        app,
        logger,
        database: pool(),
        ai: aiContext,
      };

      for (const pluginDir of pluginDirs) {
        try {
          await this.loadPlugin(pluginDir, context, app);
        } catch (error: any) {
          logger.error(`Failed to load plugin from ${pluginDir}:`, error.message);
        }
      }

      this.loaded = true;
      logger.info(`Plugin loading complete. ${pluginRegistry.getEnabledPluginCount()} plugin(s) enabled.`);
    } catch (error: any) {
      logger.error('Error during plugin loading:', error.message);
      throw error;
    }
  }

  /**
   * Discover plugin directories
   */
  private discoverPlugins(): string[] {
    if (!fs.existsSync(this.pluginsDir)) {
      logger.info(`Plugins directory not found: ${this.pluginsDir}`);
      return [];
    }

    const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });

    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(this.pluginsDir, entry.name))
      .filter(dir => {
        const manifestPath = path.join(dir, 'addon-manifest.json');
        return fs.existsSync(manifestPath);
      });
  }

  /**
   * Load a single plugin from a directory
   */
  private async loadPlugin(pluginDir: string, context: PluginContext, app: Application): Promise<void> {
    const manifestPath = path.join(pluginDir, 'addon-manifest.json');

    const manifest = this.readManifest(manifestPath);
    logger.info(`Loading plugin: ${manifest.name} v${manifest.version}`);

    this.validateManifest(manifest);

    if (!this.isCompatible(manifest)) {
      logger.warn(`Plugin ${manifest.name} is not compatible with OpenTYME v${OPENTYME_VERSION}. Skipping.`);
      return;
    }

    const plugin: Plugin = {
      manifest,
      enabled: true,
      basePath: pluginDir,
      services: new Map(),
    };

    if (manifest.backend) {
      try {
        // Run SQL migrations declared in manifest before loading code
        await this.runMigrations(plugin, context);
        await this.loadBackendComponents(plugin, context, app);
      } catch (error: any) {
        logger.error(`Failed to load backend components for ${manifest.name}:`, error.message);
        plugin.enabled = false;
      }
    }

    pluginRegistry.register(plugin);
  }

  /**
   * Run SQL migration files declared in manifest.backend.migrations
   */
  private async runMigrations(plugin: Plugin, context: PluginContext): Promise<void> {
    const { manifest, basePath } = plugin;
    const migrations = (manifest.backend as any)?.migrations as string[] | undefined;

    if (!migrations?.length) return;

    const db = context.database;

    for (const migrationFile of migrations) {
      const migrationPath = path.join(basePath, migrationFile);

      if (!fs.existsSync(migrationPath)) {
        logger.warn(`Migration file not found for ${manifest.name}: ${migrationPath}`);
        continue;
      }

      const sql = fs.readFileSync(migrationPath, 'utf-8').trim();
      if (!sql) continue;

      try {
        await db.query(sql);
        logger.info(`Plugin ${manifest.name}: ran migration ${migrationFile}`);
      } catch (error: any) {
        // Log but don't fail — migrations using IF NOT EXISTS are idempotent
        logger.error(`Plugin ${manifest.name}: migration ${migrationFile} error:`, error.message);
        throw error;
      }
    }
  }

  /**
   * Read and parse manifest file
   */
  private readManifest(manifestPath: string): AddonManifest {
    try {
      const content = fs.readFileSync(manifestPath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      throw new Error(`Failed to read manifest at ${manifestPath}: ${error.message}`);
    }
  }

  /**
   * Validate manifest structure
   */
  private validateManifest(manifest: AddonManifest): void {
    const required = ['name', 'version', 'displayName', 'description'];

    for (const field of required) {
      if (!(field in manifest)) {
        throw new Error(`Manifest missing required field: ${field}`);
      }
    }

    if (!manifest.compatibility || !manifest.compatibility.opentyme) {
      throw new Error('Manifest missing compatibility.opentyme field');
    }

    // Validate name is kebab-case
    if (!/^[a-z0-9-]+$/.test(manifest.name)) {
      throw new Error(`Manifest name must be kebab-case (lowercase letters, numbers, hyphens): ${manifest.name}`);
    }

    // Validate version is semver
    if (!semver.valid(manifest.version)) {
      throw new Error(`Manifest version is not valid semver: ${manifest.version}`);
    }
  }

  /**
   * Check if plugin is compatible with current OpenTYME version
   */
  private isCompatible(manifest: AddonManifest): boolean {
    const range = manifest.compatibility.opentyme;

    try {
      return semver.satisfies(OPENTYME_VERSION, range);
    } catch (error) {
      logger.error(`Invalid semver range in plugin ${manifest.name}: ${range}`);
      return false;
    }
  }

  /**
   * Load backend components (routes, services, etc.)
   * Automatically applies Keycloak authentication to all plugin routes.
   */
  private async loadBackendComponents(
    plugin: Plugin,
    context: PluginContext,
    app: Application
  ): Promise<void> {
    const { manifest, basePath } = plugin;

    if (!manifest.backend) return;

    if (manifest.backend.entryPoint) {
      const entryPath = path.join(basePath, manifest.backend.entryPoint);

      if (fs.existsSync(entryPath)) {
        try {
          const addonModule = await import(entryPath);
          const addonPlugin: AddonPlugin = addonModule.default || addonModule.plugin;

          if (!addonPlugin) {
            throw new Error('Plugin module must export a default plugin object');
          }

          if (addonPlugin.name !== manifest.name) {
            logger.warn(`Plugin name mismatch: ${addonPlugin.name} vs ${manifest.name}`);
          }

          if (addonPlugin.initialize) {
            logger.info(`Initializing plugin ${manifest.name}...`);
            await addonPlugin.initialize(context);
          }

          if (addonPlugin.routes && manifest.backend.routes) {
            const prefix = manifest.backend.routes.prefix;

            // Automatically protect all plugin routes with Keycloak auth.
            // Plugin developers do NOT need to add auth middleware themselves.
            app.use(prefix, authenticateKeycloak, extractKeycloakUser, addonPlugin.routes);
            plugin.router = addonPlugin.routes;
            logger.info(`Plugin ${manifest.name} routes registered at ${prefix} (auth protected)`);
          }
        } catch (error: any) {
          logger.error(`Failed to load plugin entry point for ${manifest.name}:`, error.message);
          logger.error(`Stack trace:`, error.stack);
          throw error;
        }
      } else {
        logger.warn(`Entry point not found for ${manifest.name}: ${entryPath}`);
      }
    }
  }

  /**
   * Reload all plugins (useful for development)
   */
  async reload(app: Application): Promise<void> {
    logger.info('Reloading all plugins...');
    pluginRegistry.clear();
    this.loaded = false;
    await this.loadAll(app);
  }

  /**
   * Check if plugins are loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }
}

// Export singleton instance
export const pluginLoader = new PluginLoader();
