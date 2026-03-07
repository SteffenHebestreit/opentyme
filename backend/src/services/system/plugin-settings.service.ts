/**
 * Plugin Settings Service
 * 
 * Manages plugin-specific settings storage and retrieval.
 * Handles per-user plugin configurations stored in the database.
 */

import { pool } from '../../utils/database';
import { logger } from '../../utils/logger';
import { PluginSettings } from '../../types/plugin.types';

export class PluginSettingsService {
  /**
   * Get plugin settings for a specific user
   */
  async getUserPluginSettings(userId: string, pluginName: string): Promise<PluginSettings | null> {
    try {
      const db = pool();
      const result = await db.query(
        `SELECT plugins_config FROM settings WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const pluginsConfig = result.rows[0].plugins_config || {};
      const pluginConfig = pluginsConfig[pluginName];

      if (!pluginConfig) {
        return null;
      }

      return {
        userId,
        pluginName,
        enabled: pluginConfig.enabled ?? false,
        config: pluginConfig.config || {},
      };
    } catch (error: any) {
      logger.error(`Error getting plugin settings for user ${userId}, plugin ${pluginName}:`, error.message);
      throw error;
    }
  }

  /**
   * Get all plugin settings for a user
   */
  async getAllUserPluginSettings(userId: string): Promise<Record<string, any>> {
    try {
      const db = pool();
      const result = await db.query(
        `SELECT plugins_config FROM settings WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return {};
      }

      return result.rows[0].plugins_config || {};
    } catch (error: any) {
      logger.error(`Error getting all plugin settings for user ${userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Update plugin settings for a specific user
   */
  async updateUserPluginSettings(
    userId: string,
    pluginName: string,
    settings: Partial<PluginSettings>
  ): Promise<void> {
    try {
      // Get current plugins_config
      const db = pool();
      const currentResult = await db.query(
        `SELECT plugins_config FROM settings WHERE user_id = $1`,
        [userId]
      );

      let pluginsConfig: Record<string, any> = {};
      
      if (currentResult.rows.length > 0) {
        pluginsConfig = currentResult.rows[0].plugins_config || {};
      }

      // Update the specific plugin's config
      pluginsConfig[pluginName] = {
        ...pluginsConfig[pluginName],
        enabled: settings.enabled ?? pluginsConfig[pluginName]?.enabled ?? false,
        config: {
          ...pluginsConfig[pluginName]?.config,
          ...settings.config,
        },
      };

      // Update or insert settings
      await db.query(
        `INSERT INTO settings (user_id, plugins_config)
         VALUES ($1, $2)
         ON CONFLICT (user_id) 
         DO UPDATE SET plugins_config = $2, updated_at = CURRENT_TIMESTAMP`,
        [userId, JSON.stringify(pluginsConfig)]
      );

      logger.info(`Updated plugin settings for user ${userId}, plugin ${pluginName}`);
    } catch (error: any) {
      logger.error(`Error updating plugin settings:`, error.message);
      throw error;
    }
  }

  /**
   * Enable a plugin for a user
   */
  async enablePlugin(userId: string, pluginName: string): Promise<void> {
    await this.updateUserPluginSettings(userId, pluginName, { enabled: true });
    logger.info(`Enabled plugin ${pluginName} for user ${userId}`);
  }

  /**
   * Disable a plugin for a user
   */
  async disablePlugin(userId: string, pluginName: string): Promise<void> {
    await this.updateUserPluginSettings(userId, pluginName, { enabled: false });
    logger.info(`Disabled plugin ${pluginName} for user ${userId}`);
  }

  /**
   * Check if a plugin is enabled for a user
   */
  async isPluginEnabled(userId: string, pluginName: string): Promise<boolean> {
    const settings = await this.getUserPluginSettings(userId, pluginName);
    return settings?.enabled ?? false;
  }

  /**
   * Delete plugin settings for a user
   */
  async deleteUserPluginSettings(userId: string, pluginName: string): Promise<void> {
    try {
      const db = pool();
      const currentResult = await db.query(
        `SELECT plugins_config FROM settings WHERE user_id = $1`,
        [userId]
      );

      if (currentResult.rows.length === 0) {
        return;
      }

      const pluginsConfig = currentResult.rows[0].plugins_config || {};
      delete pluginsConfig[pluginName];

      await db.query(
        `UPDATE settings SET plugins_config = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
        [JSON.stringify(pluginsConfig), userId]
      );

      logger.info(`Deleted plugin settings for user ${userId}, plugin ${pluginName}`);
    } catch (error: any) {
      logger.error(`Error deleting plugin settings:`, error.message);
      throw error;
    }
  }
}

// Export singleton instance
export const pluginSettingsService = new PluginSettingsService();
