import KcAdminClient from '@keycloak/keycloak-admin-client';
import session from 'express-session';

/**
 * Keycloak Configuration
 * 
 * This configuration sets up Keycloak Admin Client for authentication.
 * The backend validates tokens using the Keycloak Admin API.
 */

const keycloakConfig = {
  realm: process.env.KEYCLOAK_REALM || 'tyme',
  baseUrl: process.env.KEYCLOAK_PUBLIC_URL || process.env.KEYCLOAK_URL || 'http://keycloak:8080',
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
 * Session Store
 * In production, use Redis or another persistent session store.
 * For development, MemoryStore is acceptable but data is lost on restart.
 */
const memoryStore = new session.MemoryStore();

/**
 * Session Configuration
 * Used by Keycloak to manage session state.
 */
export const sessionConfig = session({
  secret: process.env.SESSION_SECRET || 'change-me-in-production-use-random-string',
  resave: false,
  saveUninitialized: true,
  store: memoryStore,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
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
    console.warn('[Keycloak] Warning: Missing environment variables:', missing);
    return false;
  }
  
  return true;
};

/**
 * Log Keycloak configuration (without secrets)
 */
export const logKeycloakConfig = (): void => {
  console.info('[Keycloak] Configuration:');
  console.info(`  - Realm: ${keycloakConfig.realm}`);
  console.info(`  - Base URL: ${keycloakConfig.baseUrl}`);
  console.info(`  - Client ID: ${keycloakConfig.clientId}`);
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
