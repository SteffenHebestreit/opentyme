/**
 * Plugin API Service
 * 
 * API functions for plugin management
 */

import apiClient from './client';
import { PluginInfo, PluginSettings } from '../../types/plugin.types';

interface PluginListResponse {
  success: boolean;
  plugins: PluginInfo[];
  total: number;
  enabled: number;
}

interface PluginDetailResponse {
  success: boolean;
  plugin: PluginInfo & {
    userSettings: Record<string, any>;
    basePath: string;
    settings?: {
      schema: Record<string, any>;
      ui?: { section: string; icon?: string };
    };
  };
}

interface PluginSettingsResponse {
  success: boolean;
  settings: PluginSettings;
}

interface MessageResponse {
  success: boolean;
  message: string;
}

/**
 * Get list of all installed plugins
 */
export const getPlugins = async (): Promise<PluginListResponse> => {
  const response = await apiClient.get<PluginListResponse>('/plugins');
  return response.data;
};

/**
 * Get details for a specific plugin
 */
export const getPlugin = async (pluginName: string): Promise<PluginDetailResponse> => {
  const response = await apiClient.get<PluginDetailResponse>(`/plugins/${pluginName}`);
  return response.data;
};

/**
 * Enable a plugin for the current user
 */
export const enablePlugin = async (pluginName: string): Promise<MessageResponse> => {
  const response = await apiClient.post<MessageResponse>(`/plugins/${pluginName}/enable`);
  return response.data;
};

/**
 * Disable a plugin for the current user
 */
export const disablePlugin = async (pluginName: string): Promise<MessageResponse> => {
  const response = await apiClient.post<MessageResponse>(`/plugins/${pluginName}/disable`);
  return response.data;
};

/**
 * Get plugin settings for the current user
 */
export const getPluginSettings = async (pluginName: string): Promise<PluginSettingsResponse> => {
  const response = await apiClient.get<PluginSettingsResponse>(`/plugins/${pluginName}/settings`);
  return response.data;
};

/**
 * Update plugin settings for the current user
 */
export const updatePluginSettings = async (
  pluginName: string, 
  config: Record<string, any>
): Promise<MessageResponse> => {
  const response = await apiClient.put<MessageResponse>(`/plugins/${pluginName}/settings`, { config });
  return response.data;
};
