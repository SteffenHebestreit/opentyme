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
 * AI integration hooks available to addons via context.ai.
 *
 * Three paths to AI integration:
 * 1. Auto: add @swagger JSDoc to route files → HTTP endpoint becomes an LLM tool automatically
 * 2. Custom: call registerTool() for non-HTTP logic (calculations, external services)
 * 3. Prompt: call registerSystemPromptExtension() to tell the LLM what your addon does
 */
export interface AIContext {
  /**
   * Register a custom non-HTTP LLM tool that runs in-process.
   * Call during initialize() — before any AI requests arrive.
   *
   * @example
   * context.ai.registerTool({
   *   name: 'my_addon_calculate_tax',
   *   description: 'Calculates AfA depreciation for a fixed asset. Use when asked about depreciation.',
   *   parameters: {
   *     type: 'object',
   *     properties: {
   *       purchase_price: { type: 'number', description: 'Asset price in EUR' },
   *       useful_life_years: { type: 'number', description: 'Expected useful life in years' },
   *     },
   *     required: ['purchase_price', 'useful_life_years'],
   *   },
   *   execute: async (args) => {
   *     const { purchase_price, useful_life_years } = args as { purchase_price: number; useful_life_years: number };
   *     return { annual_depreciation: purchase_price / useful_life_years };
   *   },
   * });
   */
  registerTool: (tool: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description?: string; enum?: (string | number)[]; items?: object; properties?: object }>;
      required?: string[];
    };
    execute: (args: Record<string, unknown>) => Promise<unknown>;
  }) => void;

  /**
   * Inject context into the LLM system prompt.
   * Use 1–3 sentences to describe what your addon's tools do and when to use them.
   * Keep it concise — each extension adds token cost to every conversation.
   *
   * @example
   * context.ai.registerSystemPromptExtension(
   *   'my-addon',
   *   'You have tools for AfA depreciation analysis — use them when asked about German tax depreciation.'
   * );
   */
  registerSystemPromptExtension: (pluginName: string, text: string) => void;
}

/**
 * Plugin initialization context
 */
export interface PluginContext {
  app: Application;
  logger: PluginLogger;
  database: Pool;
  /**
   * AI integration hooks — always present.
   * Safe to call even when the user hasn't configured the AI assistant.
   */
  ai: AIContext;
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
