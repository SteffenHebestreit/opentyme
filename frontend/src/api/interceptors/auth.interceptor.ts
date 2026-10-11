/**
 * @fileoverview Axios Authentication Interceptor
 * 
 * This interceptor automatically adds the Authorization header with the Bearer token
 * to all outgoing API requests. It retrieves the access token from localStorage
 * for each request to ensure the latest token is always used.
 * 
 * Features:
 * - Automatic Bearer token injection
 * - Retrieves fresh token from localStorage for each request
 * - Handles 401 responses and triggers logout
 * - Works with token refresh mechanism
 * 
 * @module api/interceptors/auth
 */

import { AxiosError, AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { getAccessToken, clearTokens, isTokenExpired, setTokens, shouldRefreshToken } from '@/services/auth/tokenManager';
import { keycloak } from '@/config/keycloak.config';

/**
 * Refresh an access token that is about to expire before sending a request.
 *
 * Browsers throttle timers in background tabs, so the periodic refresh in
 * AuthContext can fall behind; the first request after returning to the tab
 * (e.g. React Query's refetch on window focus) would otherwise go out with an
 * expired token and trigger the forced logout below.
 */
async function ensureFreshToken(): Promise<void> {
  // shouldRefreshToken() is false once the token has already expired — cover both
  if (!keycloak.authenticated || !(isTokenExpired() || shouldRefreshToken(30))) return;
  try {
    const refreshed = await keycloak.updateToken(30);
    if (refreshed && keycloak.token && keycloak.refreshToken) {
      setTokens(keycloak.token, keycloak.refreshToken, keycloak.idToken);
    }
  } catch {
    // Refresh failed (session ended) — send as is; the 401 handling decides.
  }
}

/**
 * Setup authentication interceptor for an Axios instance
 * 
 * This function adds request and response interceptors to the provided Axios instance:
 * 
 * Request Interceptor:
 * - Reads access token from localStorage
 * - Adds Authorization: Bearer <token> header to every request
 * 
 * Response Interceptor:
 * - Handles 401 Unauthorized responses
 * - Clears tokens and redirects to login page
 * 
 * @param axiosInstance - Axios instance to configure
 * @returns Configured Axios instance
 */
export const setupAuthInterceptor = (axiosInstance: AxiosInstance): AxiosInstance => {
  /**
   * Request Interceptor
   * 
   * Adds Authorization header with Bearer token to every request.
   * Token is retrieved from localStorage on each request to ensure
   * we always use the latest token (important after token refresh).
   */
  axiosInstance.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      await ensureFreshToken();

      // Get the current access token from localStorage
      const token = getAccessToken();
      
      if (token) {
        // Add Authorization header with Bearer token
        config.headers.Authorization = `Bearer ${token}`;
        
        if (import.meta.env.DEV) {
          console.log('[Auth Interceptor] Added Bearer token to request:', config.url);
        }
      } else {
        if (import.meta.env.DEV) {
          console.warn('[Auth Interceptor] No access token found for request:', config.url);
        }
      }
      
      return config;
    },
    (error: AxiosError) => {
      console.error('[Auth Interceptor] Request error:', error);
      return Promise.reject(error);
    }
  );

  /**
   * Response Interceptor
   * 
   * Handles authentication errors (401) by clearing tokens and redirecting to login.
   * This ensures users are logged out when their tokens are invalid or expired.
   */
  axiosInstance.interceptors.response.use(
    (response: AxiosResponse) => {
      // Simply return successful responses
      return response;
    },
    (error: AxiosError) => {
      // Handle 401 Unauthorized responses
      if (error.response?.status === 401) {
        const hasToken = Boolean(getAccessToken());
        const shouldForceLogout = !hasToken || isTokenExpired();

        if (shouldForceLogout) {
          console.warn('[Auth Interceptor] 401 Unauthorized with missing or expired token - clearing tokens and redirecting to login');

          clearTokens();

          const currentPath = window.location.pathname;
          if (currentPath !== '/login') {
            window.location.replace('/login');
          }
        } else {
          console.warn('[Auth Interceptor] 401 received while token is still present and unexpired - skipping forced redirect');
        }
      }
      
      return Promise.reject(error);
    }
  );

  return axiosInstance;
};

/**
 * Default export: Function to setup auth interceptor
 */
export default setupAuthInterceptor;
