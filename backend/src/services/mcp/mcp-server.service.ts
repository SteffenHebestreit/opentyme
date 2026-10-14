/**
 * @fileoverview OpenTyme's own MCP server (Streamable HTTP, stateless, JSON
 * responses) — served at POST /api/mcp for MCP clients such as Claude Code or
 * Cursor, authenticated with an API token that has the "mcp" capability.
 *
 * A thin adapter over the assistant's tool layer: the same tool definitions
 * (built from the OpenAPI spec, plus log_time_entry), the same argument
 * validation, and the same executor, which calls the API with the caller's
 * own Authorization header — so every call passes the token's permission
 * check a second time.
 *
 * Only a curated set of tools is exposed (MCP_TOOL_NAMES): enough to work
 * with time, clients, projects and invoices without overwhelming the client
 * with every API operation. Each caller sees only the tools its token allows.
 * There is no OpenTyme approval step here: tools carry MCP annotations
 * (readOnlyHint / destructiveHint) and the MCP client asks its user.
 *
 * @module services/mcp/mcp-server.service
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { ApiTokenPermissions } from '../auth/api-token-permissions';
import { requirementFor } from '../auth/api-token-permissions';
import { getToolsWithMeta, validateToolArguments, type ToolWithMeta } from '../ai/openapi-tool-builder.service';
import { executeToolCall } from '../ai/tool-executor.service';
import { isToolAllowedForRoles } from '../ai/tool-selection.service';
import { toolPermissionDenial } from '../ai/tool-permissions';

/** The tools MCP clients get, in the order they are listed. */
export const MCP_TOOL_NAMES = [
  // Find things
  'get_clients',
  'get_clients_by_id',
  'get_projects',
  'get_projects_by_id',
  'get_time_entries',
  'get_time_entries_by_id',
  'get_invoices',
  'get_invoices_by_id',
  'get_invoices_by_id_payments',
  'get_recurring_invoices',
  // Figures
  'get_time_summary',
  'get_time_pattern',
  'get_revenue_summary',
  'get_expense_summary',
  'get_profit_summary',
  'get_client_overview',
  'get_project_overview',
  'get_tax_package_estimate',
  // Track time
  'log_time_entry',
  'post_time_entries_start',
  'put_time_entries_stop',
  'put_time_entries_by_id',
  'delete_time_entries_by_id',
  // Set up and bill
  'post_clients',
  'post_projects',
  'post_invoices_generate_from_time_entries',
] as const;

const INSTRUCTIONS = [
  'OpenTyme is a time-tracking and invoicing app for freelancers. These tools act on the data of the',
  "API token's owner and only allow what the token permits.",
  'Find ids first: most tools take a client or project id — list them with get_clients / get_projects.',
  'log_time_entry takes a project NAME and is the easiest way to record time.',
  'For totals and trends prefer the *_summary and *_overview tools over listing raw entries.',
  'Dates are YYYY-MM-DD, times HH:MM (24h); amounts are in the owner\'s currency.',
].join(' ');

/** Who is calling: the bearer the tools call the API with, roles, and the token's permissions (null = signed-in session). */
export interface McpCaller {
  bearerToken: string;
  roles: string[];
  permissions: ApiTokenPermissions | null;
}

const curated = new Set<string>(MCP_TOOL_NAMES);

function availableTools(caller: McpCaller): ToolWithMeta[] {
  const byName = new Map(getToolsWithMeta().map((t) => [t.tool.function.name, t]));
  return MCP_TOOL_NAMES.map((name) => byName.get(name))
    .filter((t): t is ToolWithMeta => !!t)
    .filter(
      (t) =>
        isToolAllowedForRoles(t, caller.roles) &&
        (!caller.permissions || toolPermissionDenial(t.tool.function.name, caller.permissions) === null)
    );
}

function title(name: string): string {
  if (name === 'log_time_entry') return 'Log time';
  const words = name.replace(/_by_id/g, '').split('_');
  const verb: Record<string, string> = { get: 'Get', post: 'Create', put: 'Update', delete: 'Delete', patch: 'Change' };
  return [verb[words[0]] ?? words[0], ...words.slice(1)].join(' ');
}

export function toMcpTool(t: ToolWithMeta): Tool {
  const { name, description, parameters } = t.tool.function;
  const custom = t.method === 'CUSTOM';
  const readOnly = !custom && t.method === 'GET';
  const requirement = custom ? null : requirementFor(t.method, t.pathTemplate);
  const destructive = !!requirement && requirement.allowed && requirement.resource?.level === 'delete';
  return {
    name,
    title: title(name),
    description,
    inputSchema: { ...(parameters as Record<string, unknown>), type: 'object' } as Tool['inputSchema'],
    annotations: {
      readOnlyHint: readOnly,
      destructiveHint: !readOnly && destructive,
      idempotentHint: readOnly || t.method === 'PUT' || t.method === 'DELETE',
      openWorldHint: false,
    },
  };
}

function errorResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

export async function callMcpTool(caller: McpCaller, name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  if (!curated.has(name)) throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
  if (caller.permissions) {
    const missing = toolPermissionDenial(name, caller.permissions);
    if (missing) return errorResult(`This API token does not allow ${name} (needs ${missing}).`);
  }
  const validation = validateToolArguments(name, args);
  if (!validation.ok) return errorResult(`Invalid arguments: ${validation.errors.join('; ')}`);

  const result = await executeToolCall(name, args, caller.bearerToken, caller.roles);
  if (result.status >= 400 || result.error !== undefined) {
    const body = result.data ?? result.error ?? '';
    return errorResult(`Failed (HTTP ${result.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return { content: [{ type: 'text', text: JSON.stringify(result.data ?? null) }] };
}

/** A fresh MCP server for one request (stateless mode). */
export function createMcpServer(caller: McpCaller): Server {
  const server = new Server(
    { name: 'opentyme', title: 'OpenTyme', version: '1.0.0' },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: availableTools(caller).map(toMcpTool) }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    callMcpTool(caller, request.params.name, (request.params.arguments ?? {}) as Record<string, unknown>)
  );
  return server;
}
