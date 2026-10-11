/**
 * @fileoverview API Client Configuration
 * 
 * Configures Axios instance with authentication interceptor.
 * The interceptor automatically adds Bearer token to all requests.
 * 
 * @module api/services/client
 */

import axios from 'axios';
import { setupAuthInterceptor } from '../interceptors/auth.interceptor';
import { isDataWrite, notifyDataChanged } from '../../lib/dataSync';

/**
 * Create an Axios instance for API calls
 * 
 * Uses relative path to leverage Vite proxy (configured in vite.config.js)
 * This allows development requests to go through the proxy to avoid CORS issues.
 */
const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Setup authentication interceptor
 * 
 * This adds the Authorization: Bearer <token> header to all requests
 * and handles 401 Unauthorized responses by redirecting to login.
 */
setupAuthInterceptor(apiClient);

// Any successful write refreshes the data derived from it (dashboard, charts, …)
apiClient.interceptors.response.use((response) => {
  if (isDataWrite(response)) notifyDataChanged();
  return response;
});

export default apiClient;
