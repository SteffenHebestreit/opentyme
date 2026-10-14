import apiClient from './client';
import {
  ApiToken,
  ApiTokenCatalog,
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
