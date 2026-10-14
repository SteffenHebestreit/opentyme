import apiClient from './client';
import type { ApiTokenApprovalMode, ApiTokenPermissions } from '../types';

/** The OAuth authorization request as the client sent it (query parameters). */
export type AuthorizationRequest = Record<string, string>;

export interface AuthorizationDescription {
  client: { id: string; name: string; redirectHost: string };
}

export interface AuthorizationGrant {
  permissions: ApiTokenPermissions;
  approval_mode: ApiTokenApprovalMode;
  expires_at: string | null;
}

/** What the consent page shows: which client asks and where it will send the user back. */
export const describeAuthorization = async (request: AuthorizationRequest): Promise<AuthorizationDescription> => {
  const response = await apiClient.get('/oauth/authorize/request', { params: request });
  return response.data;
};

/** The user approved; answers the client URL to send them to (with the code). */
export const approveAuthorization = async (request: AuthorizationRequest, grant: AuthorizationGrant): Promise<string> => {
  const response = await apiClient.post('/oauth/authorize', { request, grant });
  return response.data.redirect;
};

/** The user declined; answers the client URL to send them to (access_denied). */
export const denyAuthorization = async (request: AuthorizationRequest): Promise<string> => {
  const response = await apiClient.post('/oauth/authorize/deny', { request });
  return response.data.redirect;
};
