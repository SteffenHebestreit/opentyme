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

export interface PathParamSchema {
  type?: string;
  format?: string;
}

interface OperationInfo {
  method: string;
  pathTemplate: string;
  tags: string[];
  /** Declared path parameters (name → schema) — validated before URL substitution. */
  pathParams: Record<string, PathParamSchema>;
}

export interface ToolWithMeta {
  tool: LLMTool;
  method: string;
  /** OpenAPI path template ('/api/...'); the registry name for custom tools. */
  pathTemplate: string;
  tags: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates one path-parameter value BEFORE it is substituted into the URL.
 * Rejects anything that could change the request path ('.', '..', '/', '\\')
 * and enforces the spec's `format: uuid` / `format: date` (and integer type).
 * Returns an error message for the model, or null when the value is safe.
 */
export function checkPathParam(name: string, value: unknown, schema?: PathParamSchema): string | null {
  if (value === undefined || value === null || value === '') return `missing required path parameter "${name}"`;
  if (typeof value !== 'string' && typeof value !== 'number') {
    return `path parameter "${name}" must be a string, got ${describeValue(value)}`;
  }
  const v = String(value).trim();
  if (v === '' || v === '.' || v === '..' || v.includes('/') || v.includes('\\')) {
    return `path parameter "${name}" is not a valid identifier`;
  }
  if (schema?.format === 'uuid' && !UUID_RE.test(v)) return `path parameter "${name}" must be a UUID`;
  if (schema?.format === 'date' && !DATE_RE.test(v)) return `path parameter "${name}" must be a date (YYYY-MM-DD)`;
  if (schema?.type === 'integer' && !/^-?\d+$/.test(v)) return `path parameter "${name}" must be an integer`;
  return null;
}

/**
 * True when the operation's success response is declared with content types
 * that are all non-JSON (PDF/ZIP/CSV/binary downloads): the assistant can't
 * use such bodies, and buffering them would only waste memory and context.
 * Operations that declare no content at all are kept.
 */
function hasOnlyNonJsonSuccess(op: Record<string, unknown>): boolean {
  const responses = (op.responses as Record<string, Record<string, unknown>> | undefined) ?? {};
  const types: string[] = [];
  for (const [code, response] of Object.entries(responses)) {
    if (!/^2\d\d$/.test(code) && code !== '2XX') continue;
    const content = response?.content as Record<string, unknown> | undefined;
    if (content) types.push(...Object.keys(content));
  }
  if (types.length === 0) return false;
  return !types.some((t) => /^application\/(.+\+)?json\b/i.test(t));
}

const BLOCKED_PREFIXES = [
  '/auth',
  '/password-reset',
  '/api-docs',
  '/health',
  '/ai',
  '/system/backups',
  // Runs under the user's session, so it could otherwise mint API tokens.
  '/api-tokens',
  '/system/api-tokens',
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

/**
 * Strip 'example' fields from property schemas to prevent LLMs from anchoring
 * on hardcoded example values (e.g. a static date like "2026-03-09") instead of
 * using user-provided values.
 */
function stripExamples(props: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const prop = { ...(value as Record<string, unknown>) };
      delete prop.example;
      cleaned[key] = prop;
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function buildParameters(
  operation: Record<string, unknown>,
  components: Record<string, unknown>
): { properties: Record<string, unknown>; required: string[]; pathParams: Record<string, PathParamSchema> } {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const pathParams: Record<string, PathParamSchema> = {};

  // Path & query parameters
  const params = (operation.parameters as Array<Record<string, unknown>>) || [];
  for (const param of params) {
    if (param.in === 'path' || param.in === 'query') {
      const schema = resolveSchema((param.schema as Record<string, unknown>) || {}, components);
      properties[param.name as string] = {
        ...schema,
        description: param.description || undefined,
      };
      if (param.required || param.in === 'path') {
        required.push(param.name as string);
      }
      if (param.in === 'path') {
        pathParams[param.name as string] = {
          ...(typeof schema.type === 'string' ? { type: schema.type } : {}),
          ...(typeof schema.format === 'string' ? { format: schema.format } : {}),
        };
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

  return { properties: stripExamples(properties), required: [...new Set(required)], pathParams };
}

// Cache
let toolsCache: LLMTool[] | null = null;
const operationMap = new Map<string, OperationInfo>();
const toolSchemaMap = new Map<string, LLMToolFunction['parameters']>();

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
      // Binary downloads (invoice PDFs, the tax-package ZIP, …) are useless to
      // the model and would be buffered whole — don't expose them as tools.
      if (hasOnlyNonJsonSuccess(op)) continue;

      const name = (op.operationId as string) || normalizeName(method, path);
      const safeName = name
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, MAX_TOOL_NAME_LENGTH);

      const description = [op.summary, op.description].filter(Boolean).join(' — ').slice(0, 512) || `${method.toUpperCase()} ${path}`;

      const { properties, required, pathParams } = buildParameters(op, components);

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
      operationMap.set(safeName, {
        method: method.toUpperCase(),
        // A few annotations use Express-style ':id' segments — normalize them to
        // OpenAPI '{id}' so the executor can substitute (and validate) them.
        pathTemplate: path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}'),
        tags: (op.tags as string[]) || [],
        pathParams,
      });
      toolSchemaMap.set(safeName, tool.function.parameters);
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
    operationMap.set(safeName, { method: 'CUSTOM', pathTemplate: def.name, tags: ['Custom'], pathParams: {} });
    toolSchemaMap.set(safeName, def.parameters);
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

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' || (typeof value === 'string' && value !== '' && !Number.isNaN(Number(value)));
    case 'integer':
      return (
        (typeof value === 'number' && Number.isInteger(value)) ||
        (typeof value === 'string' && /^-?\d+$/.test(value))
      );
    case 'boolean':
      return typeof value === 'boolean' || value === 'true' || value === 'false';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return !!value && typeof value === 'object' && !Array.isArray(value);
    default:
      return true;
  }
}

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Lenient pre-execution validation of tool-call arguments against the tool's
 * JSON schema: required keys present, primitive types plausible (string-encoded
 * numbers/booleans are accepted — HTTP query params are strings anyway), enum
 * membership. Unknown keys are ignored. Field-path-level messages let the model
 * repair the call in one retry instead of burning a failed HTTP round-trip.
 */
export function validateToolArguments(
  toolName: string,
  args: Record<string, unknown>
): { ok: true } | { ok: false; errors: string[] } {
  if (!toolsCache) buildTools();
  const schema = toolSchemaMap.get(toolName);
  if (!schema) return { ok: true }; // unknown tool — handled by the executor

  const errors: string[] = [];
  // Path parameters: checked first and strictly (format + path-segment safety)
  // so the model gets a precise repair message before execution or approval.
  const pathParams = operationMap.get(toolName)?.pathParams ?? {};
  for (const [name, paramSchema] of Object.entries(pathParams)) {
    const problem = checkPathParam(name, args[name], paramSchema);
    if (problem) errors.push(problem);
  }
  for (const req of schema.required ?? []) {
    if (req in pathParams) continue; // reported above
    const v = args[req];
    if (v === undefined || v === null || v === '') {
      errors.push(`missing required parameter "${req}"`);
    }
  }
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    const prop = (schema.properties ?? {})[key] as Record<string, unknown> | undefined;
    if (!prop) continue;
    const type = prop.type as string | undefined;
    if (type && !matchesType(value, type)) {
      errors.push(`parameter "${key}" must be ${type}, got ${describeValue(value)}`);
    }
    const allowed = prop.enum as unknown[] | undefined;
    if (allowed && !allowed.includes(value)) {
      errors.push(`parameter "${key}" must be one of ${JSON.stringify(allowed)}`);
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

/**
 * Returns every built tool alongside its HTTP method and OpenAPI tags.
 * Used by tool-selection to apply role filtering and relevance ranking.
 */
export function getToolsWithMeta(): ToolWithMeta[] {
  const tools = buildTools();
  return tools.map((t) => {
    const info = operationMap.get(t.function.name);
    return {
      tool: t,
      method: info?.method ?? 'GET',
      pathTemplate: info?.pathTemplate ?? '',
      tags: info?.tags ?? [],
    };
  });
}
