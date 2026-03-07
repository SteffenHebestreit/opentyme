/**
 * TypeScript type definitions for the OpenTYME Plugin System
 */

import { Router, Application } from 'express';
import { Pool } from 'pg';

/**
 * Addon manifest structure - defines the complete plugin configuration
 */
export interface AddonManifest {
  name: string;
  displayName: string;
  version: string;
  description: string;
  author: string;
  license: string;
  
  compatibility: {
    opentyme: string; // Semver range, e.g., ">=1.0.0 <2.0.0"
  };
  
  backend?: BackendConfig;
  frontend?: FrontendConfig;
  settings?: SettingsConfig;
}

/**
 * Backend configuration in addon manifest
 */
export interface BackendConfig {
  entryPoint: string;
  routes?: {
    prefix: string;
    file: string;
  };
  services?: string[];
  migrations?: string[];
  dependencies?: Record<string, string>;
}

/**
 * Frontend configuration in addon manifest
 */
export interface FrontendConfig {
  entryPoint: string;
  routes?: RouteConfig[];
  slots?: SlotConfig[];
  dependencies?: Record<string, string>;
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
  };
}

/**
 * Slot configuration for frontend component injection
 */
export interface SlotConfig {
  name: string;
  component: string;
  order?: number;
}

/**
 * Settings configuration in addon manifest
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
  label?: string;
  description?: string;
}

/**
 * Runtime plugin instance
 */
export interface Plugin {
  manifest: AddonManifest;
  enabled: boolean;
  router?: Router;
  basePath: string;
  services?: Map<string, any>;
}

/**
 * Logger interface for plugins
 */
export interface PluginLogger {
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
  debug: (message: string, ...args: any[]) => void;
}

/**
 * Plugin initialization context
 */
export interface PluginContext {
  app: Application;
  logger: PluginLogger;
  database: Pool;
}

/**
 * Addon plugin interface - what the addon exports
 */
export interface AddonPlugin {
  name: string;
  initialize?: (context: PluginContext) => Promise<void>;
  routes?: Router;
  onUserInit?: (userId: string) => Promise<void>;
  shutdown?: () => Promise<void>;
}

/**
 * Plugin metadata stored in database
 */
export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  manifest: AddonManifest;
  enabled: boolean;
  installedAt: Date;
  updatedAt: Date;
}

/**
 * User-specific plugin settings
 */
export interface PluginSettings {
  userId: string;
  pluginName: string;
  enabled: boolean;
  config: Record<string, any>;
}
