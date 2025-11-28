/**
 * @fileoverview Keycloak configuration and instance for direct authentication
 * 
 * This module provides the Keycloak JS adapter for frontend authentication.
 * The frontend authenticates directly with Keycloak using a public client,
 * eliminating the need for backend authentication endpoints.
 * 
 * Features:
 * - Public client with PKCE for security
 * - Direct authentication flow
 * - Token management in localStorage
 * - Automatic token refresh
 * 
 * @module config/keycloak
 */

import Keycloak from 'keycloak-js';

export interface KeycloakConfig {
  url: string;
  realm: string;
  clientId: string;
}

/**
 * Keycloak configuration from environment variables
 * 
 * Environment Variables:
 * - VITE_KEYCLOAK_URL: Keycloak server URL (default: http://localhost:8080)
 * - VITE_KEYCLOAK_REALM: Keycloak realm name (default: tyme)
 * - VITE_KEYCLOAK_CLIENT_ID: Keycloak client ID (default: tyme-frontend)
 */
export const keycloakConfig: KeycloakConfig = {
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'tyme',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'tyme-frontend',
};

/**
 * Keycloak instance
 * 
 * This is the main Keycloak object used throughout the application.
 * It's a singleton instance that manages authentication state.
 */
export const keycloak = new Keycloak(keycloakConfig);

/**
 * Keycloak initialization options
 * 
 * onLoad: 'check-sso' - Check if user is already authenticated without forcing login
 * checkLoginIframe: true - Enable session status check via iframe
 * pkceMethod: 'S256' - Use PKCE (Proof Key for Code Exchange) for enhanced security
 */
export const keycloakInitOptions = {
  onLoad: 'check-sso' as const,
  checkLoginIframe: true,
  pkceMethod: 'S256' as const,
  enableLogging: import.meta.env.DEV,
};

/**
 * Token refresh threshold
 * Refresh token 30 seconds before expiration (as per requirements)
 */
export const TOKEN_REFRESH_THRESHOLD = 30; // seconds

/**
 * Token check interval
 * Check token expiration every 5 seconds (as per requirements)
 */
export const TOKEN_CHECK_INTERVAL = 5000; // milliseconds

/**
 * Check if Keycloak is enabled
 * Can be disabled via environment variable for development
 */
export const isKeycloakEnabled = (): boolean => {
  return import.meta.env.VITE_KEYCLOAK_ENABLED !== 'false';
};

export default keycloak;
