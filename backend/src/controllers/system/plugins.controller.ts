/**
 * Plugins Controller
 * 
 * Handles HTTP requests for plugin management
 */

import { Request, Response } from 'express';
import { pluginRegistry } from '../../plugins/plugin-registry';
import { pluginSettingsService } from '../../services/system/plugin-settings.service';
import { logger } from '../../utils/logger';

export class PluginsController {
  /**
   * GET /api/plugins
   * List all installed plugins
   */
  async listPlugins(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const plugins = pluginRegistry.getAllPlugins();

      // Get user-specific enabled status for each plugin
      const pluginsWithUserStatus = await Promise.all(
        plugins.map(async (plugin) => {
          const userSettings = userId
            ? await pluginSettingsService.getUserPluginSettings(userId, plugin.manifest.name)
            : null;

          return {
            name: plugin.manifest.name,
            displayName: plugin.manifest.displayName,
            version: plugin.manifest.version,
            description: plugin.manifest.description,
            author: plugin.manifest.author,
            license: plugin.manifest.license,
            enabled: plugin.enabled,
            userEnabled: userSettings?.enabled ?? false,
            hasBackend: !!plugin.manifest.backend,
            hasFrontend: !!plugin.manifest.frontend,
            hasSettings: !!plugin.manifest.settings,
          };
        })
      );

      res.json({
        success: true,
        plugins: pluginsWithUserStatus,
        total: plugins.length,
        enabled: pluginRegistry.getEnabledPluginCount(),
      });
    } catch (error: any) {
      logger.error('Error listing plugins:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to list plugins',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/plugins/:name
   * Get details for a specific plugin
   */
  async getPlugin(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;
      const userId = req.user?.id;
      
      const plugin = pluginRegistry.getPlugin(name);

      if (!plugin) {
        res.status(404).json({
          success: false,
          message: `Plugin ${name} not found`,
        });
        return;
      }

      // Get user-specific settings
      const userSettings = userId
        ? await pluginSettingsService.getUserPluginSettings(userId, name)
        : null;

      res.json({
        success: true,
        plugin: {
          ...plugin.manifest,
          enabled: plugin.enabled,
          userEnabled: userSettings?.enabled ?? false,
          userSettings: userSettings?.config || {},
          basePath: plugin.basePath,
        },
      });
    } catch (error: any) {
      logger.error('Error getting plugin:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to get plugin',
        error: error.message,
      });
    }
  }

  /**
   * POST /api/plugins/:name/enable
   * Enable a plugin for the current user
   */
  async enablePlugin(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const plugin = pluginRegistry.getPlugin(name);

      if (!plugin) {
        res.status(404).json({
          success: false,
          message: `Plugin ${name} not found`,
        });
        return;
      }

      await pluginSettingsService.enablePlugin(userId, name);

      res.json({
        success: true,
        message: `Plugin ${name} enabled`,
      });
    } catch (error: any) {
      logger.error('Error enabling plugin:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to enable plugin',
        error: error.message,
      });
    }
  }

  /**
   * POST /api/plugins/:name/disable
   * Disable a plugin for the current user
   */
  async disablePlugin(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      await pluginSettingsService.disablePlugin(userId, name);

      res.json({
        success: true,
        message: `Plugin ${name} disabled`,
      });
    } catch (error: any) {
      logger.error('Error disabling plugin:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to disable plugin',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/plugins/:name/settings
   * Get plugin settings for the current user
   */
  async getPluginSettings(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const settings = await pluginSettingsService.getUserPluginSettings(userId, name);

      res.json({
        success: true,
        settings: settings || { enabled: false, config: {} },
      });
    } catch (error: any) {
      logger.error('Error getting plugin settings:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to get plugin settings',
        error: error.message,
      });
    }
  }

  /**
   * PUT /api/plugins/:name/settings
   * Update plugin settings for the current user
   */
  async updatePluginSettings(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;
      const userId = req.user?.id;
      const { config } = req.body;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const plugin = pluginRegistry.getPlugin(name);

      if (!plugin) {
        res.status(404).json({
          success: false,
          message: `Plugin ${name} not found`,
        });
        return;
      }

      await pluginSettingsService.updateUserPluginSettings(userId, name, { config });

      res.json({
        success: true,
        message: `Plugin ${name} settings updated`,
      });
    } catch (error: any) {
      logger.error('Error updating plugin settings:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to update plugin settings',
        error: error.message,
      });
    }
  }
}

export const pluginsController = new PluginsController();
