/**
 * Plugin React Query Hooks
 * 
 * Custom hooks for plugin management using React Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as pluginService from '../services/plugin.service';

/**
 * Hook to get list of all plugins
 *
 * @param options.enabled - set false while signed out: a 401 from this request
 *   sends the browser to /login, which made public pages unreachable
 */
export const usePlugins = (options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: ['plugins'],
    queryFn: pluginService.getPlugins,
    enabled: options?.enabled ?? true,
  });
};

/**
 * Hook to get details for a specific plugin
 */
export const usePlugin = (pluginName: string) => {
  return useQuery({
    queryKey: ['plugins', pluginName],
    queryFn: () => pluginService.getPlugin(pluginName),
    enabled: !!pluginName,
  });
};

/**
 * Hook to get plugin settings
 */
export const usePluginSettings = (pluginName: string) => {
  return useQuery({
    queryKey: ['plugins', pluginName, 'settings'],
    queryFn: () => pluginService.getPluginSettings(pluginName),
    enabled: !!pluginName,
  });
};

/**
 * Hook to enable a plugin
 */
export const useEnablePlugin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pluginName: string) => pluginService.enablePlugin(pluginName),
    onSuccess: (_, pluginName) => {
      // Invalidate queries to refresh plugin list and specific plugin
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      queryClient.invalidateQueries({ queryKey: ['plugins', pluginName] });
    },
  });
};

/**
 * Hook to disable a plugin
 */
export const useDisablePlugin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pluginName: string) => pluginService.disablePlugin(pluginName),
    onSuccess: (_, pluginName) => {
      // Invalidate queries to refresh plugin list and specific plugin
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      queryClient.invalidateQueries({ queryKey: ['plugins', pluginName] });
    },
  });
};

/**
 * Hook to update plugin settings
 */
export const useUpdatePluginSettings = (pluginName: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: Record<string, any>) => 
      pluginService.updatePluginSettings(pluginName, config),
    onSuccess: () => {
      // Invalidate queries to refresh plugin settings
      queryClient.invalidateQueries({ queryKey: ['plugins', pluginName, 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['plugins', pluginName] });
    },
  });
};
