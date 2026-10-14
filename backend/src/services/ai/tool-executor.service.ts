/**
 * Executes LLM tool calls by forwarding them as HTTP requests to the backend itself,
 * using the user's original Bearer token for proper authorization enforcement.
 */

import { TOOL_CALL_HEADER } from '../auth/internal-call';
import axios from 'axios';
import { logger } from '../../utils/logger';
import { checkPathParam, getOperationByName } from './openapi-tool-builder.service';
import { getCustomToolByName } from './ai-tool-registry.service';
import { isToolAllowedForRoles } from './tool-selection.service';
import { safeToolErrorMessage } from './tool-call-utils';

export interface ToolResult {
  status: number;
  data?: unknown;
  error?: string;
}

/**
 * Whether a tool mutates data and therefore requires human approval before
 * execution. HTTP tools: anything that isn't a GET. Custom tools: opt out via
 * `requiresApproval: false`, otherwise treated as a write for safety.
 */
export function isWriteTool(toolName: string): boolean {
  const custom = getCustomToolByName(toolName);
  if (custom) return custom.requiresApproval !== false;
  const op = getOperationByName(toolName);
  if (!op) return false;
  return op.method !== 'GET';
}

const MAX_RESPONSE_CHARS = 8000;
// Hard cap on what a tool call may buffer — results are trimmed to
// MAX_RESPONSE_CHARS for the model anyway.
const MAX_CONTENT_LENGTH = 2 * 1024 * 1024;
const INTERNAL_BASE_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:8000';

export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  bearerToken: string,
  roles?: string[],
  signal?: AbortSignal
): Promise<ToolResult> {
  // Short-circuit: custom (non-HTTP) tools registered by addons run in-process
  const customTool = getCustomToolByName(toolName);
  if (customTool) {
    try {
      const result = await customTool.execute(args, { bearerToken });
      logger.debug(`[AI ToolExecutor] Custom tool ${toolName} executed successfully`);
      return { status: 200, data: result };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[AI ToolExecutor] Custom tool ${toolName} error: ${message}`);
      return { status: 500, error: safeToolErrorMessage(err) };
    }
  }

  const operation = getOperationByName(toolName);
  if (!operation) {
    logger.warn(`[AI ToolExecutor] Unknown tool: ${toolName}`);
    return { status: 400, error: `Unknown tool: ${toolName}` };
  }

  // Defense in depth: refuse tools the user's roles may not use, even if the
  // model selected one it shouldn't (the API's own authz remains the backstop).
  if (roles && !isToolAllowedForRoles(operation, roles)) {
    logger.warn(`[AI ToolExecutor] Role-blocked tool ${toolName} for roles [${roles.join(',')}]`);
    return { status: 403, error: `You do not have permission to use ${toolName}.` };
  }

  const { method, pathTemplate } = operation;

  // Substitute path parameters — each value is validated first (declared
  // format, no '.', '..' or '/' segments) so a model-supplied id can never
  // redirect the request to a different route.
  let url = pathTemplate;
  const remainingArgs = { ...args };
  const pathParamMatches = pathTemplate.match(/\{([^}]+)\}/g) || [];
  for (const match of pathParamMatches) {
    const paramName = match.slice(1, -1);
    const problem = checkPathParam(paramName, remainingArgs[paramName], operation.pathParams?.[paramName]);
    if (problem) {
      logger.warn(`[AI ToolExecutor] Rejected path parameter for ${toolName}: ${problem}`);
      return { status: 400, error: `Invalid arguments for ${toolName}: ${problem}.` };
    }
    url = url.replace(match, encodeURIComponent(String(remainingArgs[paramName]).trim()));
    delete remainingArgs[paramName];
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
        // Marks the call as the assistant's own (not new use of an API token).
        [TOOL_CALL_HEADER]: '1',
      },
      timeout: 30000,
      maxContentLength: MAX_CONTENT_LENGTH,
      signal,
      validateStatus: () => true, // don't throw on non-2xx
    });

    let responseData = response.data;
    const contentType = String(response.headers?.['content-type'] ?? '');
    if (contentType && !/json|text\//i.test(contentType)) {
      // Binary payloads (PDF, ZIP, images) are meaningless to the model.
      responseData = { _note: `Binary response (${contentType.split(';')[0]}) omitted.` };
    }
    const serialized = JSON.stringify(responseData) ?? '';
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
    // No raw transport text (internal host/port) in results that reach the client.
    const code = (error as { code?: string })?.code;
    const tooLarge = /maxContentLength/i.test(message);
    return {
      status: 500,
      error: tooLarge
        ? 'The API response was too large to process. Narrow the request with filters.'
        : `The API request failed${code ? ` (${code})` : ''}.`,
    };
  }
}
