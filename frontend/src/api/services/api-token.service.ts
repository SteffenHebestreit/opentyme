import apiClient from './client';
import {
  AdminApiToken,
  ApiToken,
  ApiTokenCatalog,
  ApiTokenEvent,
  ApiTokenWithSecret,
  CreateApiTokenPayload,
  UpdateApiTokenPayload,
} from '../types';

/**
 * API service for personal access tokens.
 * Secrets only ever come back from create and regenerate.
 */

export const getApiTokens = async (): Promise<ApiToken[]> => {
  const response = await apiClient.get('/api-tokens');
  return response.data.tokens;
};

/** The resources, levels and capabilities a token can be given. */
export const getApiTokenCatalog = async (): Promise<ApiTokenCatalog> => {
  const response = await apiClient.get('/api-tokens/catalog');
  return response.data;
};

export const createApiToken = async (data: CreateApiTokenPayload): Promise<ApiTokenWithSecret> => {
  const response = await apiClient.post('/api-tokens', data);
  return { token: response.data.token, secret: response.data.secret };
};

export const updateApiToken = async (id: string, data: UpdateApiTokenPayload): Promise<ApiToken> => {
  const response = await apiClient.patch(`/api-tokens/${id}`, data);
  return response.data.token;
};

/** Issues a new secret; the old one stops working at once. */
export const regenerateApiToken = async (id: string, expiresAt: string | null): Promise<ApiTokenWithSecret> => {
  const response = await apiClient.post(`/api-tokens/${id}/regenerate`, { expires_at: expiresAt });
  return { token: response.data.token, secret: response.data.secret };
};

export const revokeApiToken = async (id: string): Promise<void> => {
  await apiClient.delete(`/api-tokens/${id}`);
};

/** Recent activity of the user's tokens, newest first. */
export const getApiTokenEvents = async (limit = 20): Promise<ApiTokenEvent[]> => {
  const response = await apiClient.get('/api-tokens/events', { params: { limit } });
  return response.data.events;
};

/** Administrators: every user's tokens with their owners. */
export const getAllApiTokens = async (): Promise<AdminApiToken[]> => {
  const response = await apiClient.get('/system/api-tokens');
  return response.data.tokens;
};

/** Administrators: revoke any user's token; the owner is told by email. */
export const adminRevokeApiToken = async (id: string): Promise<void> => {
  await apiClient.delete(`/system/api-tokens/${id}`);
};
