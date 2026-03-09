/**
 * AI Tool Registry
 *
 * Allows addons to register non-HTTP LLM tools (calculations, external
 * service calls, etc.) during plugin initialization via context.ai.registerTool().
 *
 * Tools registered here are merged into the OpenAPI-derived tool list
 * by buildTools() in openapi-tool-builder.service.ts on the first AI request.
 *
 * Timing guarantee: plugins initialize() before any HTTP requests arrive,
 * and buildTools() is called lazily on the first AI request — so all custom
 * tools are always registered before the tool cache is built.
 */

import { logger } from '../../utils/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CustomToolParameter {
  type: 'string' | 'number' | 'boolean' | 'integer' | 'array' | 'object';
  description?: string;
  enum?: (string | number)[];
  items?: CustomToolParameter;
  properties?: Record<string, CustomToolParameter>;
}

export interface CustomToolDefinition {
  /** Unique name across all custom tools. Must not clash with OpenAPI operationIds. */
  name: string;
  /** 1–2 sentences shown to the LLM to decide when to call this tool. */
  description: string;
  /** JSON Schema for the tool's input parameters. */
  parameters: {
    type: 'object';
    properties: Record<string, CustomToolParameter>;
    required?: string[];
  };
  /**
   * The actual implementation. Receives the parsed args the LLM passed.
   * Must return a JSON-serializable value.
   * Throw an Error to signal failure — the message is returned to the LLM.
   */
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const customTools = new Map<string, CustomToolDefinition>();

/**
 * Register a custom LLM tool.
 * Called from plugin initialize(context) via context.ai.registerTool(...).
 * Duplicate names log a warning and the new registration wins.
 */
export function registerCustomTool(tool: CustomToolDefinition): void {
  if (customTools.has(tool.name)) {
    logger.warn(`[AI ToolRegistry] Overwriting existing custom tool: ${tool.name}`);
  }
  customTools.set(tool.name, tool);
  logger.info(`[AI ToolRegistry] Registered custom tool: ${tool.name}`);
}

/** Returns all registered custom tools. */
export function getCustomTools(): CustomToolDefinition[] {
  return Array.from(customTools.values());
}

/**
 * Look up a custom tool by name.
 * Used by tool-executor.service.ts to short-circuit before the HTTP path.
 */
export function getCustomToolByName(name: string): CustomToolDefinition | undefined {
  return customTools.get(name);
}

/** Clear all custom tools — only used in tests. */
export function clearCustomTools(): void {
  customTools.clear();
}
