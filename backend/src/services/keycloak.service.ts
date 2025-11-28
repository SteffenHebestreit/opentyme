/**
 * Keycloak Service (Consolidated)
 * Provides comprehensive Keycloak integration including:
 * - Token validation and introspection
 * - User management (CRUD operations)
 * - Authentication flows (login, logout, refresh)
 * - User registration
 * Uses both Admin Client SDK and REST API for Keycloak operations.
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import axios from 'axios';

interface KeycloakConfig {
  baseUrl: string;
  realmName: string;
  adminClientId: string;
  adminClientSecret: string;
  clientId: string;
  clientSecret: string;
}

interface TokenIntrospection {
  active: boolean;
  sub?: string;
  preferred_username?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: {
    roles: string[];
  };
  exp?: number;
  iat?: number;
  aud?: string | string[];
  iss?: string;
  typ?: string;
}

interface UserInfo {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  name?: string;
  roles: string[];
}

interface KeycloakTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in: number;
  refresh_token: string;
  token_type: string;
  session_state?: string;
  scope: string;
}

interface KeycloakUserRegistration {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

class KeycloakService {
  private client: KcAdminClient;
  private config: KeycloakConfig;
  private authenticated: boolean = false;
  private authPromise: Promise<void> | null = null;

  constructor() {
    this.config = {
      baseUrl: process.env.KEYCLOAK_URL || 'http://keycloak:8080',
      realmName: process.env.KEYCLOAK_REALM || 'tyme',
      adminClientId: process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'tyme-admin-service',
      adminClientSecret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || 'admin-service-secret-change-in-production',
      clientId: process.env.KEYCLOAK_CLIENT_ID || 'tyme-app',
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || 'tyme-secret-change-in-production',
    };

    this.client = new KcAdminClient({
      baseUrl: this.config.baseUrl,
      realmName: this.config.realmName,
    });
  }

  /**
   * Authenticate with Keycloak using service account credentials
   */
  private async authenticate(): Promise<void> {
    // If already authenticating, return existing promise
    if (this.authPromise) {
      return this.authPromise;
    }

    // If already authenticated, check if token is still valid
    if (this.authenticated) {
      try {
        // Test if token is still valid by making a lightweight request
        await this.client.realms.findOne({ realm: this.config.realmName });
        return;
      } catch (error) {
        // Token expired, need to re-authenticate
        this.authenticated = false;
      }
    }

    // Create new authentication promise
    this.authPromise = (async () => {
      try {
        await this.client.auth({
          grantType: 'client_credentials',
          clientId: this.config.adminClientId,
          clientSecret: this.config.adminClientSecret,
        });
        this.authenticated = true;
        console.log('[Keycloak Service] ✅ Authenticated with service account');
      } catch (error) {
        console.error('[Keycloak Service] ❌ Authentication failed:', error);
        throw error;
      } finally {
        this.authPromise = null;
      }
    })();

    return this.authPromise;
  }

  /**
   * Verify and introspect a token
   * Returns token details if valid, null if invalid
   */
  async verifyToken(token: string): Promise<TokenIntrospection | null> {
    try {
      await this.authenticate();

      // Use token introspection endpoint
      const response = await fetch(
        `${this.config.baseUrl}/realms/${this.config.realmName}/protocol/openid-connect/token/introspect`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            token: token,
          }),
        }
      );

      if (!response.ok) {
        console.error('[Keycloak Service] Token introspection failed:', response.status);
        return null;
      }

      const introspection: TokenIntrospection = await response.json();

      if (!introspection.active) {
        return null;
      }

      return introspection;
    } catch (error) {
      console.error('[Keycloak Service] Token verification error:', error);
      return null;
    }
  }

  /**
   * Get user information from token introspection
   */
  getUserInfoFromToken(introspection: TokenIntrospection): UserInfo | null {
    if (!introspection.active || !introspection.sub) {
      return null;
    }

    return {
      id: introspection.sub,
      username: introspection.preferred_username || '',
      email: introspection.email || '',
      emailVerified: introspection.email_verified || false,
      firstName: introspection.given_name,
      lastName: introspection.family_name,
      name: introspection.name,
      roles: introspection.realm_access?.roles || [],
    };
  }

  /**
   * Get user by ID from Keycloak
   */
  async getUserById(userId: string): Promise<any> {
    try {
      await this.authenticate();
      const user = await this.client.users.findOne({
        realm: this.config.realmName,
        id: userId,
      });
      return user;
    } catch (error) {
      console.error('[Keycloak Service] Error fetching user:', error);
      return null;
    }
  }

  /**
   * Get all users from Keycloak
   * @param {number} max - Maximum number of users to return (default: 1000)
   * @returns {Promise<any[]>} Array of user objects
   */
  async getAllUsers(max: number = 1000): Promise<any[]> {
    try {
      await this.authenticate();
      const users = await this.client.users.find({
        realm: this.config.realmName,
        max,
      });
      return users || [];
    } catch (error) {
      console.error('[Keycloak Service] Error fetching all users:', error);
      return [];
    }
  }

  /**
   * Create a new user in Keycloak
   */
  async createUser(userData: {
    username: string;
    email: string;
    firstName?: string;
    lastName?: string;
    password: string;
    enabled?: boolean;
  }): Promise<{ id: string } | null> {
    try {
      await this.authenticate();

      const response = await this.client.users.create({
        realm: this.config.realmName,
        username: userData.username,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        enabled: userData.enabled !== false,
        emailVerified: false,
        credentials: [
          {
            type: 'password',
            value: userData.password,
            temporary: false,
          },
        ],
        attributes: {
          policy: ['readonly'], // MinIO policy for new users
        },
      });

      // Assign default 'user' role
      if (response.id) {
        try {
          const roles = await this.client.roles.find({ realm: this.config.realmName });
          const userRole = roles.find((r) => r.name === 'user');
          if (userRole && userRole.id) {
            await this.client.users.addRealmRoleMappings({
              realm: this.config.realmName,
              id: response.id,
              roles: [{ id: userRole.id, name: userRole.name! }],
            });
          }
        } catch (roleError) {
          console.error('[Keycloak Service] Error assigning default role:', roleError);
        }
      }

      console.log('[Keycloak Service] ✅ User created:', response.id);

      // Send email verification
      if (response.id) {
        try {
          await this.client.users.executeActionsEmail({
            realm: this.config.realmName,
            id: response.id,
            actions: ['VERIFY_EMAIL'],
            clientId: 'tyme-frontend', // Frontend client for email verification redirect
            lifespan: 43200, // 12 hours
            redirectUri: 'http://localhost:3000/login',
          });
          console.log('[Keycloak Service] ✅ Verification email sent to:', userData.email);
        } catch (emailError) {
          console.error('[Keycloak Service] ❌ Failed to send verification email:', emailError);
          // Don't fail user creation if email fails
        }
      }

      return { id: response.id };
    } catch (error) {
      console.error('[Keycloak Service] Error creating user:', error);
      return null;
    }
  }

  /**
   * Update user in Keycloak
   */
  async updateUser(
    userId: string,
    userData: {
      email?: string;
      firstName?: string;
      lastName?: string;
      enabled?: boolean;
    }
  ): Promise<boolean> {
    try {
      await this.authenticate();

      await this.client.users.update(
        {
          realm: this.config.realmName,
          id: userId,
        },
        userData
      );

      console.log('[Keycloak Service] ✅ User updated:', userId);
      return true;
    } catch (error) {
      console.error('[Keycloak Service] Error updating user:', error);
      return false;
    }
  }

  /**
   * Delete user from Keycloak
   */
  async deleteUser(userId: string): Promise<boolean> {
    try {
      await this.authenticate();

      await this.client.users.del({
        realm: this.config.realmName,
        id: userId,
      });

      console.log('[Keycloak Service] ✅ User deleted:', userId);
      return true;
    } catch (error) {
      console.error('[Keycloak Service] Error deleting user:', error);
      return false;
    }
  }

  /**
   * Register a new user in Keycloak via Admin API
   * Includes role assignment and proper configuration
   * 
   * @param userData - User registration data
   * @returns Success message and user ID
   */
  async registerUser(userData: KeycloakUserRegistration): Promise<{ message: string; userId: string }> {
    try {
      const result = await this.createUser({
        username: userData.username,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        password: userData.password,
        enabled: true,
      });

      if (!result) {
        throw new Error('Failed to create user');
      }

      // Assign role if specified
      if (userData.role && result.id) {
        try {
          const roles = await this.client.roles.find({ realm: this.config.realmName });
          const roleToAssign = roles.find(r => r.name === userData.role);
          if (roleToAssign && roleToAssign.id) {
            await this.client.users.addRealmRoleMappings({
              realm: this.config.realmName,
              id: result.id,
              roles: [{ id: roleToAssign.id, name: roleToAssign.name! }],
            });
          }
        } catch (roleError) {
          console.error('[Keycloak Service] Error assigning role:', roleError);
        }
      }

      return {
        message: 'User registered successfully',
        userId: result.id,
      };
    } catch (error: any) {
      if (error.response?.status === 409) {
        throw new Error('Username or email already exists');
      }
      console.error('[Keycloak Service] Registration error:', error);
      throw new Error('Failed to register user in Keycloak');
    }
  }

  /**
   * Authenticate user with username/email and password
   * Uses Direct Access Grants (Resource Owner Password Credentials)
   * 
   * @param emailOrUsername - User's email or username
   * @param password - User's password
   * @returns Keycloak token response
   */
  async login(emailOrUsername: string, password: string): Promise<KeycloakTokenResponse> {
    try {
      const response = await axios.post(
        `${this.config.baseUrl}/realms/${this.config.realmName}/protocol/openid-connect/token`,
        new URLSearchParams({
          grant_type: 'password',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          username: emailOrUsername,
          password: password,
          scope: 'openid profile email',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      console.log(`[Keycloak Service] User ${emailOrUsername} logged in successfully`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Invalid credentials');
      }
      console.error('[Keycloak Service] Login error:', error.response?.data || error.message);
      throw new Error('Authentication failed');
    }
  }

  /**
   * Refresh access token using refresh token
   * 
   * @param refreshToken - The refresh token
   * @returns New token response
   */
  async refreshToken(refreshToken: string): Promise<KeycloakTokenResponse> {
    try {
      const response = await axios.post(
        `${this.config.baseUrl}/realms/${this.config.realmName}/protocol/openid-connect/token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('[Keycloak Service] Token refresh error:', error.response?.data || error.message);
      throw new Error('Failed to refresh token');
    }
  }

  /**
   * Logout user by invalidating refresh token
   * 
   * @param refreshToken - The refresh token to invalidate
   */
  async logout(refreshToken: string): Promise<void> {
    try {
      await axios.post(
        `${this.config.baseUrl}/realms/${this.config.realmName}/protocol/openid-connect/logout`,
        new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      console.log('[Keycloak Service] User logged out successfully');
    } catch (error: any) {
      console.error('[Keycloak Service] Logout error:', error.response?.data || error.message);
      throw new Error('Failed to logout');
    }
  }

  /**
   * Get user info from Keycloak using access token
   * 
   * @param accessToken - The access token
   * @returns User information
   */
  async getUserInfo(accessToken: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.config.baseUrl}/realms/${this.config.realmName}/protocol/openid-connect/userinfo`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('[Keycloak Service] Get user info error:', error.response?.data || error.message);
      throw new Error('Failed to get user information');
    }
  }
}

// Export singleton instance
export const keycloakService = new KeycloakService();

// Export class for use in controllers that need the class
export { KeycloakService };

// Default export
export default keycloakService;
