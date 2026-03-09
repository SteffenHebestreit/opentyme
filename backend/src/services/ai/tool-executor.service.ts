/**
 * Executes LLM tool calls by forwarding them as HTTP requests to the backend itself,
 * using the user's original Bearer token for proper authorization enforcement.
 */

import axios from 'axios';
import { logger } from '../../utils/logger';
import { getOperationByName } from './openapi-tool-builder.service';
import { getCustomToolByName } from './ai-tool-registry.service';

export interface ToolResult {
  status: number;
  data?: unknown;
  error?: string;
}

const MAX_RESPONSE_CHARS = 8000;
const INTERNAL_BASE_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:8000';

export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  bearerToken: string
): Promise<ToolResult> {
  // Short-circuit: custom (non-HTTP) tools registered by addons run in-process
  const customTool = getCustomToolByName(toolName);
  if (customTool) {
    try {
      const result = await customTool.execute(args);
      logger.debug(`[AI ToolExecutor] Custom tool ${toolName} executed successfully`);
      return { status: 200, data: result };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[AI ToolExecutor] Custom tool ${toolName} error: ${message}`);
      return { status: 500, error: message };
    }
  }

  const operation = getOperationByName(toolName);
  if (!operation) {
    logger.warn(`[AI ToolExecutor] Unknown tool: ${toolName}`);
    return { status: 400, error: `Unknown tool: ${toolName}` };
  }

  const { method, pathTemplate } = operation;

  // Substitute path parameters
  let url = pathTemplate;
  const remainingArgs = { ...args };
  const pathParamMatches = pathTemplate.match(/\{([^}]+)\}/g) || [];
  for (const match of pathParamMatches) {
    const paramName = match.slice(1, -1);
    if (remainingArgs[paramName] !== undefined) {
      url = url.replace(match, encodeURIComponent(String(remainingArgs[paramName])));
      delete remainingArgs[paramName];
    }
  }

  // Separate query params vs body
  const isReadMethod = ['GET', 'DELETE'].includes(method);
  const params = isReadMethod ? remainingArgs : undefined;
  const data = !isReadMethod ? remainingArgs : undefined;

  try {
    const response = await axios({
      method,
      url,
      baseURL: INTERNAL_BASE_URL,
      params,
      data,
      headers: {
        Authorization: bearerToken,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
      validateStatus: () => true, // don't throw on non-2xx
    });

    let responseData = response.data;
    const serialized = JSON.stringify(responseData);
    if (serialized.length > MAX_RESPONSE_CHARS) {
      if (Array.isArray(responseData)) {
        // Keep as many complete items as fit within the char budget
        let kept = responseData.length;
        while (kept > 1 && JSON.stringify(responseData.slice(0, kept)).length > MAX_RESPONSE_CHARS) {
          kept = Math.max(1, Math.floor(kept * 0.75));
        }
        const truncated = responseData.slice(0, kept);
        responseData = {
          items: truncated,
          total_returned: responseData.length,
          shown: kept,
          _truncated: kept < responseData.length,
          _note: kept < responseData.length
            ? `Response too large — showing ${kept} of ${responseData.length} items. Use aggregation endpoints (get_time_summary, get_revenue_summary, etc.) for totals instead.`
            : undefined,
        };
      } else {
        responseData = { _truncated: true, preview: serialized.slice(0, MAX_RESPONSE_CHARS) };
      }
    }

    logger.debug(`[AI ToolExecutor] ${method} ${url} → ${response.status}`);
    return { status: response.status, data: responseData };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[AI ToolExecutor] Error calling ${method} ${url}: ${message}`);
    return { status: 500, error: message };
  }
}
