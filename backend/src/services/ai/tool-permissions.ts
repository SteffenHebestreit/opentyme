/**
 * @fileoverview Which assistant tools an API token's permissions allow.
 *
 * A conversation started with an API token is limited to that token's
 * permissions for its whole life — whoever continues it, including the owner
 * approving its actions in the web app. The token can read the conversation,
 * so nothing may land in it that the token couldn't fetch itself.
 *
 * The same policy decides as for the token's own HTTP requests
 * (services/auth/api-token-permissions.ts): an OpenAPI tool maps to its
 * method + path; a custom tool to the API calls it declares (`apiAccess`).
 *
 * @module services/ai/tool-permissions
 */

import { ApiTokenPermissions, checkPermission, requirementFor } from '../auth/api-token-permissions';
import { getCustomToolByName } from './ai-tool-registry.service';
import { getOperationByName } from './openapi-tool-builder.service';

/**
 * What the permissions lack for this tool ("invoices:write"), or null when
 * they allow it. Unknown tool names return null: the executor reports those.
 */
export function toolPermissionDenial(toolName: string, permissions: ApiTokenPermissions): string | null {
  const custom = getCustomToolByName(toolName);
  let calls: Array<{ method: string; path: string }>;
  if (custom) {
    if (!custom.apiAccess || custom.apiAccess.length === 0) return 'a tool that is not available to API tokens';
    calls = custom.apiAccess;
  } else {
    const operation = getOperationByName(toolName);
    if (!operation) return null;
    calls = [{ method: operation.method, path: operation.pathTemplate }];
  }

  for (const call of calls) {
    const check = checkPermission(permissions, requirementFor(call.method, call.path));
    if (!check.ok) return check.missing;
  }
  return null;
}
