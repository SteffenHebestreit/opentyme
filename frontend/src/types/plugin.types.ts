/**
 * TypeScript type definitions for the OpenTYME Frontend Plugin System
 */

import { ComponentType } from 'react';

/**
 * Addon manifest structure — mirrors the full addon-manifest.json file.
 * routes and slots are nested under the `frontend` key.
 */
export interface FrontendAddonManifest {
  name: string;
  displayName: string;
  version: string;
  description: string;
  author?: string;

  compatibility?: { opentyme: string };

  frontend?: {
    entryPoint?: string;
    routes?: RouteConfig[];
    slots?: SlotConfig[];
  };

  settings?: SettingsConfig;
}

/**
 * Route configuration for frontend
 */
export interface RouteConfig {
  path: string;
  component: string;
  protected?: boolean;
  menuItem?: {
    label: string;
    icon: string;
    section: string;
    order?: number;
  };
}

/**
 * Slot configuration for component injection
 */
export interface SlotConfig {
  name: string;
  component: string;
  order?: number;
}

/**
 * Settings configuration
 */
export interface SettingsConfig {
  schema: Record<string, SettingField>;
  ui?: {
    section: string;
    icon?: string;
  };
}

/**
 * Individual setting field definition
 */
export interface SettingField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  default?: any;
  enum?: any[];
  secret?: boolean;
  required?: boolean;
  description?: string;
  label?: string;
}

/**
 * Frontend plugin instance
 */
export interface FrontendPlugin {
  manifest: FrontendAddonManifest;
  enabled: boolean;
  routes: LoadedRoute[];
  slots: Map<string, LoadedSlotComponent[]>;
}

/**
 * Loaded route with component
 */
export interface LoadedRoute {
  path: string;
  component: ComponentType<any>;
  protected: boolean;
  pluginName?: string;
  menuItem?: {
    label: string;
    icon: string;
    section: string;
    order: number;
  };
}

/**
 * Loaded slot component
 */
export interface LoadedSlotComponent {
  pluginName: string;
  component: ComponentType<any>;
  order: number;
}

/**
 * Slot context - data passed to slot components
 */
export interface SlotContext {
  [key: string]: any;
}

/**
 * Plugin settings from API
 */
export interface PluginSettings {
  enabled: boolean;
  config: Record<string, any>;
}

/**
 * Plugin info from API
 */
export interface PluginInfo {
  name: string;
  displayName: string;
  version: string;
  description: string;
  author: string;
  license?: string;
  enabled: boolean;
  userEnabled: boolean;
  hasBackend: boolean;
  hasFrontend: boolean;
  hasSettings: boolean;
}

/**
 * Addon frontend plugin interface - what the addon exports
 */
export interface AddonFrontendPlugin {
  name: string;
  routes?: LoadedRoute[];
  slots?: Record<string, ComponentType<any>>;
  initialize?: () => Promise<void>;
}
