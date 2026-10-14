import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createApiToken,
  getApiTokenCatalog,
  getApiTokens,
  regenerateApiToken,
  revokeApiToken,
  updateApiToken,
} from '../../api/services/api-token.service';
import { CreateApiTokenPayload, UpdateApiTokenPayload } from '../../api/types';
import { queryKeys } from './queryKeys';

/** The signed-in user's API tokens. */
export const useApiTokens = () =>
  useQuery({
    queryKey: queryKeys.apiTokens.list,
    queryFn: getApiTokens,
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.apiTokens.list }),
  });
};

export const useUpdateApiToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateApiTokenPayload }) => updateApiToken(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.apiTokens.list }),
  });
};

export const useRegenerateApiToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expiresAt }: { id: string; expiresAt: string | null }) => regenerateApiToken(id, expiresAt),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.apiTokens.list }),
  });
};

export const useRevokeApiToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeApiToken(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.apiTokens.list }),
  });
};
