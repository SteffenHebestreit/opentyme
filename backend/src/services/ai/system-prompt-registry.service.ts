/**
 * System Prompt Registry
 *
 * Allows addons to inject context into the LLM system prompt via
 * context.ai.registerSystemPromptExtension() during plugin initialization.
 *
 * Extensions are appended after the core system prompt on every AI run.
 * Keep extensions concise — each one adds token cost to every conversation.
 */

import { logger } from '../../utils/logger';

const extensions = new Map<string, string>();

/**
 * Register a system prompt extension from an addon.
 * @param pluginName  Unique plugin identifier (used as key; later registrations overwrite earlier ones)
 * @param text        1–3 sentences describing what the addon's tools do and when to use them
 */
export function registerSystemPromptExtension(pluginName: string, text: string): void {
  extensions.set(pluginName, text.trim());
  logger.info(`[AI SystemPrompt] Extension registered from: ${pluginName}`);
}

/**
 * Returns all registered extensions as a single string block,
 * or an empty string when no addons have registered anything.
 * Called once per AI run inside ai-assistant.service.ts.
 */
export function buildSystemPromptExtensions(): string {
  if (extensions.size === 0) return '';
  const parts = Array.from(extensions.values()).filter(Boolean);
  if (parts.length === 0) return '';
  return '\n\n--- Addon Capabilities ---\n' + parts.join('\n');
}

/** Clear all extensions — only used in tests. */
export function clearSystemPromptExtensions(): void {
  extensions.clear();
}
