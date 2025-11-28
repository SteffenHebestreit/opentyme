/**
 * API Interceptor with Keycloak Token Injection
 * 
 * This module provides a fetch wrapper that automatically injects
 * Keycloak authentication tokens into API requests.
 */

import type Keycloak from 'keycloak-js';

/**
 * Fetch wrapper with automatic token injection
 * 
 * @param keycloak - Keycloak instance
 * @param url - Request URL
 * @param options - Fetch options
 * @returns Promise with fetch response
 */
export const keycloakFetch = async (
  keycloak: Keycloak | null,
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  // If Keycloak is not available or not authenticated, use regular fetch
  if (!keycloak || !keycloak.authenticated) {
    console.warn('[API] No Keycloak token available, making unauthenticated request');
    return fetch(url, options);
  }

  // Inject token into headers
  // Note: Token validation is handled by the backend on each request
  // Frontend only manages token refresh via interval check (every 10 seconds)
  const headers = new Headers(options.headers);
  
  if (keycloak.token) {
    headers.set('Authorization', `Bearer ${keycloak.token}`);
  }

  // Make request with token
  return fetch(url, {
    ...options,
    headers,
  });
};

/**
 * Create an API client with Keycloak token injection
 * 
 * @param keycloak - Keycloak instance
 * @param baseURL - Base URL for API requests
 * @returns API client object with common HTTP methods
 */
export const createKeycloakApiClient = (keycloak: Keycloak | null, baseURL: string) => {
  const request = async (
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> => {
    const url = `${baseURL}${endpoint}`;
    return keycloakFetch(keycloak, url, options);
  };

  return {
    get: async (endpoint: string, options: RequestInit = {}) => {
      return request(endpoint, { ...options, method: 'GET' });
    },

    post: async (endpoint: string, data?: any, options: RequestInit = {}) => {
      return request(endpoint, {
        ...options,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: data ? JSON.stringify(data) : undefined,
      });
    },

    put: async (endpoint: string, data?: any, options: RequestInit = {}) => {
      return request(endpoint, {
        ...options,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: data ? JSON.stringify(data) : undefined,
      });
    },

    patch: async (endpoint: string, data?: any, options: RequestInit = {}) => {
      return request(endpoint, {
        ...options,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: data ? JSON.stringify(data) : undefined,
      });
    },

    delete: async (endpoint: string, options: RequestInit = {}) => {
      return request(endpoint, { ...options, method: 'DELETE' });
    },
  };
};

/**
 * Response handler with JSON parsing and error handling
 * 
 * @param response - Fetch response
 * @returns Parsed JSON data
 * @throws Error with message from API response
 */
export const handleApiResponse = async <T = any>(response: Response): Promise<T> => {
  if (!response.ok) {
    let errorMessage = `API Error: ${response.status} ${response.statusText}`;
    
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {
      // If response is not JSON, use status text
    }
    
    throw new Error(errorMessage);
  }

  // Handle empty responses
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return {} as T;
  }

  return response.json();
};

/**
 * Example usage:
 * 
 * import { useKeycloak } from '../contexts/KeycloakContext';
 * import { createKeycloakApiClient, handleApiResponse } from '../utils/keycloakApiInterceptor';
 * 
 * const MyComponent = () => {
 *   const { keycloak } = useKeycloak();
 *   const apiClient = createKeycloakApiClient(keycloak, import.meta.env.VITE_API_BASE_URL);
 * 
 *   const fetchData = async () => {
 *     try {
 *       const response = await apiClient.get('/api/clients');
 *       const data = await handleApiResponse(response);
 *       console.log(data);
 *     } catch (error) {
 *       console.error('Failed to fetch data:', error);
 *     }
 *   };
 * 
 *   return <button onClick={fetchData}>Fetch Data</button>;
 * };
 */
