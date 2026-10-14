/**
 * @fileoverview Personal access token models.
 *
 * A token lets an external client (a script, an AI agent, an MCP client) act
 * as its owner, limited to the permissions stored with it.
 *
 * @module models/auth/api-token
 */

import type { ApiTokenPermissions, ApprovalMode } from '../../services/auth/api-token-permissions';

/** A token as the API returns it — never the secret or its hash. */
export interface ApiToken {
  id: string;
  name: string;
  description: string | null;
  /** First characters of the token, enough to recognise it in a config file. */
  token_prefix: string;
  permissions: ApiTokenPermissions;
  /** Who approves the assistant's write actions for runs started by this token. */
  approval_mode: ApprovalMode;
  /** null = never expires. */
  expires_at: Date | null;
  last_used_at: Date | null;
  last_used_ip: string | null;
  last_used_user_agent: string | null;
  created_at: Date;
  updated_at: Date;
  /** Set when an OAuth client (e.g. an MCP client) obtained the token. */
  oauth_client_id: string | null;
  /** That client's self-declared name (lists only). */
  oauth_client_name?: string | null;
}

/** What the auth middleware needs to authorise a request. */
export interface AuthenticatedApiToken {
  id: string;
  user_id: string;
  name: string;
  permissions: ApiTokenPermissions;
  approval_mode: ApprovalMode;
  expires_at: Date | null;
}

export interface CreateApiTokenDto {
  name: string;
  description?: string | null;
  permissions: ApiTokenPermissions;
  approval_mode?: ApprovalMode;
  expires_at?: Date | null;
  /** The OAuth client the token is issued to (set by the token endpoint). */
  oauth_client_id?: string | null;
}

/** Expiry changes only by regenerating, so a leaked token can't be extended. */
export interface UpdateApiTokenDto {
  name?: string;
  description?: string | null;
  permissions?: ApiTokenPermissions;
  approval_mode?: ApprovalMode;
}

/** The token's owner, as Keycloak knows them. */
export interface ApiTokenOwner {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  emailVerified: boolean;
}
