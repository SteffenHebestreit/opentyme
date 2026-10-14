import KcAdminClient from '@keycloak/keycloak-admin-client';
import { logger } from '../utils/logger';

/**
 * Keycloak Configuration
 *
 * This configuration sets up Keycloak Admin Client for authentication.
 * The backend validates tokens using the Keycloak Admin API.
 */

const keycloakConfig = {
  realm: process.env.KEYCLOAK_REALM || 'tyme',
  baseUrl: process.env.KEYCLOAK_URL || process.env.KEYCLOAK_PUBLIC_URL || 'http://keycloak:8080',
  clientId: process.env.KEYCLOAK_CLIENT_ID || 'tyme-app',
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || 'tyme-secret-change-in-production',
};

/**
 * Keycloak Admin Client Instance
 */
export const kcAdminClient = new KcAdminClient({
  baseUrl: keycloakConfig.baseUrl,
  realmName: keycloakConfig.realm,
});

/**
 * Export config for reference
 */
export default keycloakConfig;

/**
 * Helper function to check if Keycloak is properly configured
 */
export const isKeycloakConfigured = (): boolean => {
  const requiredVars = [
    'KEYCLOAK_REALM',
    'KEYCLOAK_URL',
    'KEYCLOAK_CLIENT_ID',
    'KEYCLOAK_CLIENT_SECRET'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    logger.warn('[Keycloak] Warning: Missing environment variables:', missing);
    return false;
  }

  return true;
};

/**
 * Log Keycloak configuration (without secrets)
 */
export const logKeycloakConfig = (): void => {
  logger.info('[Keycloak] Configuration:');
  logger.info(`  - Realm: ${keycloakConfig.realm}`);
  logger.info(`  - Base URL: ${keycloakConfig.baseUrl}`);
  logger.info(`  - Client ID: ${keycloakConfig.clientId}`);
};

/**
 * Check if Keycloak is enabled
 */
export const isKeycloakEnabled = (): boolean => {
  return process.env.KEYCLOAK_ENABLED !== 'false';
};

/**
 * Role definitions
 */
export const ROLES = {
  ADMIN: 'admin',
  PROJECT_MANAGER: 'project_manager',
  DEVELOPER: 'developer',
  USER: 'user'
} as const;

/**
 * Check if user has required permission/role
 */
export const hasPermission = (userRoles: string[], requiredRole: string): boolean => {
  return userRoles.includes(requiredRole) || userRoles.includes(ROLES.ADMIN);
};
