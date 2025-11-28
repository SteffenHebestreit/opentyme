import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createClient,
  deleteClient,
  fetchClient,
  fetchClients,
  updateClient,
} from '../../api/services/client.service';
import { ApiListParams, Client, ClientPayload } from '../../api/types';
import { queryKeys } from './queryKeys';

/**
 * React Query hook for fetching all clients.
 * Automatically handles caching, refetching, and loading states.
 * 
 * @param {ApiListParams} [params] - Optional query parameters for filtering/pagination
 * @returns {UseQueryResult<Client[]>} React Query result object with clients data and query state
 * 
 * @example
 * const { data: clients, isLoading, error } = useClients();
 * const { data: activeClients } = useClients({ status: 'active' });
 */
export function useClients(params?: ApiListParams) {
  return useQuery<Client[]>({
    queryKey: queryKeys.clients.list(params),
    queryFn: () => fetchClients(params),
    staleTime: 0, // Always refetch when params change
  });
}

/**
 * React Query hook for fetching a single client by ID.
 * Query is disabled if no ID is provided.
 * 
 * @param {string | undefined} id - The UUID of the client to fetch
 * @returns {UseQueryResult<Client>} React Query result object with client data and query state
 * 
 * @example
 * const { data: client, isLoading } = useClient(clientId);
 * if (client) {
 *   console.log(client.name);
 * }
 */
export function useClient(id: string | undefined) {
  return useQuery<Client>({
    queryKey: queryKeys.clients.detail(id ?? 'pending'),
    queryFn: () => fetchClient(id as string),
    enabled: Boolean(id),
  });
}

/**
 * React Query mutation hook for creating a new client.
 * Automatically invalidates the clients list cache on success.
 * 
 * @returns {UseMutationResult} React Query mutation object with mutate function and mutation state
 * 
 * @example
 * const { mutate: createClientMutation, isPending } = useCreateClient();
 * createClientMutation({
 *   name: 'Acme Corp',
 *   email: 'contact@acme.com',
 *   status: 'active'
 * }, {
 *   onSuccess: (client) => {
 *     console.log('Created:', client.id);
 *   }
 * });
 */
export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ClientPayload) => createClient(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ 
        queryKey: queryKeys.clients.all,
        refetchType: 'all'
      });
    },
  });
}

/**
 * React Query mutation hook for updating an existing client.
 * Automatically invalidates both the clients list and the specific client detail cache on success.
 * 
 * @returns {UseMutationResult} React Query mutation object with mutate function and mutation state
 * 
 * @example
 * const { mutate: updateClientMutation } = useUpdateClient();
 * updateClientMutation({
 *   id: clientId,
 *   payload: { status: 'inactive' }
 * }, {
 *   onSuccess: () => {
 *     console.log('Client updated');
 *   }
 * });
 */
export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ClientPayload }) => updateClient(id, payload),
    onSuccess: (_client: Client, variables: { id: string; payload: ClientPayload }) => {
      void queryClient.invalidateQueries({ 
        queryKey: queryKeys.clients.all,
        refetchType: 'all'
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(variables.id) });
    },
  });
}

/**
 * React Query mutation hook for deleting a client.
 * Automatically invalidates the clients list cache on success.
 * Will fail if the client has associated projects.
 * 
 * @returns {UseMutationResult} React Query mutation object with mutate function and mutation state
 * 
 * @example
 * const { mutate: deleteClientMutation, isPending } = useDeleteClient();
 * deleteClientMutation(clientId, {
 *   onSuccess: () => {
 *     console.log('Client deleted');
 *   },
 *   onError: (error) => {
 *     console.error('Cannot delete client with projects');
 *   }
 * });
 */
export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteClient(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ 
        queryKey: queryKeys.clients.all,
        refetchType: 'all'
      });
    },
  });
}
