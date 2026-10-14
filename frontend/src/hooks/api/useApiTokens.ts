import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminRevokeApiToken,
  createApiToken,
  getAllApiTokens,
  getApiTokenCatalog,
  getApiTokenEvents,
  getApiTokens,
  regenerateApiToken,
  revokeApiToken,
  updateApiToken,
} from '../../api/services/api-token.service';
import { CreateApiTokenPayload, UpdateApiTokenPayload } from '../../api/types';
import { queryKeys } from './queryKeys';

/** A change shows in the list and in the activity log. */
const invalidateTokens = (queryClient: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.apiTokens.list }),
    queryClient.invalidateQueries({ queryKey: queryKeys.apiTokens.events }),
  ]);

/** The signed-in user's API tokens. */
export const useApiTokens = () =>
  useQuery({
    queryKey: queryKeys.apiTokens.list,
    queryFn: getApiTokens,
  });

/** Recent activity of the user's tokens. */
export const useApiTokenEvents = () =>
  useQuery({
    queryKey: queryKeys.apiTokens.events,
    queryFn: () => getApiTokenEvents(20),
  });

/** What a token can be given. Static per server version, so cached for the session. */
export const useApiTokenCatalog = () =>
  useQuery({
    queryKey: queryKeys.apiTokens.catalog,
    queryFn: getApiTokenCatalog,
    staleTime: Infinity,
  });

export const useCreateApiToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateApiTokenPayload) => createApiToken(data),
    onSuccess: () => invalidateTokens(queryClient),
  });
};

export const useUpdateApiToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateApiTokenPayload }) => updateApiToken(id, data),
    onSuccess: () => invalidateTokens(queryClient),
  });
};

export const useRegenerateApiToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expiresAt }: { id: string; expiresAt: string | null }) => regenerateApiToken(id, expiresAt),
    onSuccess: () => invalidateTokens(queryClient),
  });
};

export const useRevokeApiToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeApiToken(id),
    onSuccess: () => invalidateTokens(queryClient),
  });
};

/** Administrators: every user's tokens. Loaded only when `enabled` (the tab is open). */
export const useAllApiTokens = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.apiTokens.all,
    queryFn: getAllApiTokens,
    enabled,
  });

export const useAdminRevokeApiToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminRevokeApiToken(id),
    onSuccess: () =>
      Promise.all([invalidateTokens(queryClient), queryClient.invalidateQueries({ queryKey: queryKeys.apiTokens.all })]),
  });
};
