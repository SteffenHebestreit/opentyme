/**
 * @fileoverview Telling the assistant's own calls back into the API apart.
 *
 * The assistant and the MCP server run their tools by calling the API over
 * loopback with the caller's own token, so those calls pass the same checks.
 * They are marked with TOOL_CALL_HEADER so they don't count as new use of an
 * API token. Only a loopback request is believed — nobody outside the backend
 * can send one.
 *
 * Kept free of other imports: the tool executor needs it, and its tests must
 * not load the Keycloak client.
 *
 * @module services/auth/internal-call
 */

/** Header the assistant's tool executor sets on its own calls back into the API. */
export const TOOL_CALL_HEADER = 'X-OpenTyme-Tool-Call';

export function isLoopback(ip: string | undefined): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}
