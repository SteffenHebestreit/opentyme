/**
 * Converts the OpenAPI spec into LLM function-calling tool definitions.
 * Cached after first call — the spec is static at runtime.
 */

import { swaggerSpec } from '../../config/swagger.config';
import { logger } from '../../utils/logger';
import { getCustomTools } from './ai-tool-registry.service';

interface LLMToolFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface LLMTool {
  type: 'function';
  function: LLMToolFunction;
}

interface OperationInfo {
  method: string;
  pathTemplate: string;
}

const BLOCKED_PREFIXES = [
  '/auth',
  '/password-reset',
  '/api-docs',
  '/health',
  '/ai',
  '/system/backups',
];

const MAX_TOOL_NAME_LENGTH = 64;

function normalizeName(method: string, path: string): string {
  // Remove /api prefix, replace non-alphanumeric with _, trim to max length
  const cleanPath = path
    .replace(/^\/api/, '')
    .replace(/\{[^}]+\}/g, 'by_id')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const name = `${method}_${cleanPath}`.toLowerCase();
  return name.slice(0, MAX_TOOL_NAME_LENGTH);
}

function isBlocked(apiPath: string): boolean {
  const stripped = apiPath.replace(/^\/api/, '');
  return BLOCKED_PREFIXES.some((prefix) => stripped === prefix || stripped.startsWith(prefix + '/'));
}

function resolveSchema(schema: Record<string, unknown>, components: Record<string, unknown>): Record<string, unknown> {
  if (!schema) return {};
  if (schema.$ref && typeof schema.$ref === 'string') {
    const refPath = (schema.$ref as string).replace('#/components/schemas/', '');
    const resolved = (components as Record<string, Record<string, unknown>>)[refPath];
    return resolved ? resolveSchema(resolved, components) : {};
  }
  return schema;
}

function buildParameters(
  operation: Record<string, unknown>,
  components: Record<string, unknown>
): { properties: Record<string, unknown>; required: string[] } {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  // Path & query parameters
  const params = (operation.parameters as Array<Record<string, unknown>>) || [];
  for (const param of params) {
    if (param.in === 'path' || param.in === 'query') {
      const schema = resolveSchema((param.schema as Record<string, unknown>) || {}, components);
      properties[param.name as string] = {
        ...schema,
        description: param.description || undefined,
      };
      if (param.required) {
        required.push(param.name as string);
      }
    }
  }

  // Request body
  const requestBody = operation.requestBody as Record<string, unknown> | undefined;
  if (requestBody) {
    const content = requestBody.content as Record<string, unknown> | undefined;
    const jsonContent = content?.['application/json'] as Record<string, unknown> | undefined;
    if (jsonContent?.schema) {
      const bodySchema = resolveSchema(jsonContent.schema as Record<string, unknown>, components);
      const bodyProps = (bodySchema.properties as Record<string, unknown>) || {};
      const bodyRequired = (bodySchema.required as string[]) || [];
      Object.assign(properties, bodyProps);
      required.push(...bodyRequired);
    }
  }

  return { properties, required };
}

// Cache
let toolsCache: LLMTool[] | null = null;
const operationMap = new Map<string, OperationInfo>();

export function buildTools(): LLMTool[] {
  if (toolsCache) return toolsCache;

  const spec = swaggerSpec as Record<string, unknown>;
  const paths = (spec.paths as Record<string, unknown>) || {};
  const components = ((spec.components as Record<string, unknown>)?.schemas as Record<string, unknown>) || {};

  const tools: LLMTool[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (isBlocked(path)) continue;

    for (const [method, operation] of Object.entries(pathItem as Record<string, unknown>)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;

      const op = operation as Record<string, unknown>;
      const name = (op.operationId as string) || normalizeName(method, path);
      const safeName = name
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, MAX_TOOL_NAME_LENGTH);

      const description = [op.summary, op.description].filter(Boolean).join(' — ').slice(0, 512) || `${method.toUpperCase()} ${path}`;

      const { properties, required } = buildParameters(op, components);

      const tool: LLMTool = {
        type: 'function',
        function: {
          name: safeName,
          description,
          parameters: {
            type: 'object',
            properties,
            ...(required.length > 0 ? { required } : {}),
          },
        },
      };

      tools.push(tool);
      operationMap.set(safeName, { method: method.toUpperCase(), pathTemplate: path });
    }
  }

  // Merge custom (non-HTTP) tools registered by addons
  const customTools = getCustomTools();
  for (const def of customTools) {
    const safeName = def.name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').slice(0, MAX_TOOL_NAME_LENGTH);
    tools.push({
      type: 'function',
      function: {
        name: safeName,
        description: def.description,
        parameters: def.parameters,
      },
    });
    operationMap.set(safeName, { method: 'CUSTOM', pathTemplate: def.name });
  }

  toolsCache = tools;
  const httpCount = tools.length - customTools.length;
  logger.info(`[AI] Built ${tools.length} LLM tools (${httpCount} HTTP + ${customTools.length} custom)`);
  return tools;
}

export function getOperationByName(name: string): OperationInfo | undefined {
  if (!toolsCache) buildTools();
  return operationMap.get(name);
}
