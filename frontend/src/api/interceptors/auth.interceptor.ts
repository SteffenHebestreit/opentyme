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
import { getAccessToken, clearTokens } from '@/services/auth/tokenManager';

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
    (config: InternalAxiosRequestConfig) => {
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
        console.warn('[Auth Interceptor] 401 Unauthorized - clearing tokens and redirecting to login');
        
        // Clear all tokens from localStorage
        clearTokens();
        
        // Redirect to login page
        // Use window.location instead of router to ensure a full page reload
        // This clears any cached state and ensures fresh authentication
        const currentPath = window.location.pathname;
        if (currentPath !== '/login') {
          window.location.href = '/login';
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
