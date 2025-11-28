/**
 * Extended Express type definitions
 * Consolidates all Express Request extensions in one place
 */

import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      /**
       * User information from JWT or Keycloak authentication
       * Can be populated by either authenticateToken or Keycloak middleware
       */
      user?: {
        id: string;
        email: string;
        role?: 'user' | 'admin';
        // Keycloak-specific properties (optional)
        keycloakId?: string;
        username?: string;
        firstName?: string;
        lastName?: string;
        name?: string;  // Full name from Keycloak
        fullName?: string;
        roles?: string[];
        emailVerified?: boolean;
      };

      /**
       * Keycloak grant information (populated by keycloak-connect)
       */
      kauth?: {
        grant?: {
          access_token?: {
            token?: string;
            content?: {
              sub?: string;
              email?: string;
              email_verified?: boolean;
              preferred_username?: string;
              given_name?: string;
              family_name?: string;
              name?: string;
              realm_access?: {
                roles?: string[];
              };
              resource_access?: {
                [key: string]: {
                  roles?: string[];
                };
              };
              [key: string]: any;
            };
          };
        };
      };
    }
  }
}

export {};
