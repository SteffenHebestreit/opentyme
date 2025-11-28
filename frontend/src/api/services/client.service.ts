import apiClient from './client';
import { ApiListParams, Client, ClientPayload } from '../types';

/**
 * Client service object providing all client-related API operations.
 */
export const clientService = {
  fetchClients,
  fetchClient,
  createClient,
  updateClient,
  deleteClient,
};

/**
 * Fetches all clients from the API.
 * Supports optional query parameters for filtering and pagination.
 * 
 * @async
 * @param {ApiListParams} [params] - Optional query parameters for filtering/pagination
 * @returns {Promise<Client[]>} Array of client objects
 * @throws {Error} If the API request fails
 * 
 * @example
 * const clients = await fetchClients();
 * const filteredClients = await fetchClients({ status: 'active' });
 */
export async function fetchClients(params?: ApiListParams): Promise<Client[]> {
  const { data } = await apiClient.get<Client[]>('/clients', { params });
  return data;
}

/**
 * Fetches a single client by ID from the API.
 * 
 * @async
 * @param {string} id - The UUID of the client to fetch
 * @returns {Promise<Client>} The client object
 * @throws {Error} If the client is not found or the API request fails
 * 
 * @example
 * const client = await fetchClient('123e4567-e89b-12d3-a456-426614174000');
 */
export async function fetchClient(id: string): Promise<Client> {
  const { data } = await apiClient.get<Client>(`/clients/${id}`);
  return data;
}

/**
 * Creates a new client via the API.
 * 
 * @async
 * @param {ClientPayload} payload - The client data to create
 * @returns {Promise<Client>} The created client object with generated ID
 * @throws {Error} If validation fails or the API request fails
 * 
 * @example
 * const newClient = await createClient({
 *   name: 'Acme Corporation',
 *   email: 'contact@acme.com',
 *   status: 'active'
 * });
 */
export async function createClient(payload: ClientPayload): Promise<Client> {
  const { data } = await apiClient.post<Client>('/clients', payload);
  return data;
}

/**
 * Updates an existing client via the API.
 * Supports partial updates - only provided fields will be updated.
 * 
 * @async
 * @param {string} id - The UUID of the client to update
 * @param {ClientPayload} payload - The client data to update (partial)
 * @returns {Promise<Client>} The updated client object
 * @throws {Error} If the client is not found or the API request fails
 * 
 * @example
 * const updated = await updateClient('uuid', { status: 'inactive' });
 */
export async function updateClient(id: string, payload: ClientPayload): Promise<Client> {
  const { data } = await apiClient.put<Client>(`/clients/${id}`, payload);
  return data;
}

/**
 * Deletes a client from the API.
 * Will fail if the client has associated projects due to foreign key constraints.
 * 
 * @async
 * @param {string} id - The UUID of the client to delete
 * @returns {Promise<void>} Resolves when deletion is successful
 * @throws {Error} If the client has projects or the API request fails
 * 
 * @example
 * try {
 *   await deleteClient('uuid');
 *   console.log('Client deleted successfully');
 * } catch (error) {
 *   console.error('Cannot delete client with projects');
 * }
 */
export async function deleteClient(id: string): Promise<void> {
  await apiClient.delete(`/clients/${id}`);
}
