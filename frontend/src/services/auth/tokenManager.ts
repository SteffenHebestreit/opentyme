/**
 * @fileoverview Token Manager Service
 * 
 * Manages authentication tokens in localStorage.
 * Provides functions to store, retrieve, and manage access and refresh tokens.
 * 
 * Token Structure:
 * - accessToken: JWT access token for API authentication
 * - refreshToken: JWT refresh token for obtaining new access tokens
 * - idToken: Optional ID token with user information
 * - tokenExpiry: Timestamp when access token expires
 * 
 * @module services/auth/tokenManager
 */

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const ID_TOKEN_KEY = 'idToken';
const TOKEN_EXPIRY_KEY = 'tokenExpiry';

/**
 * Store access token in localStorage
 * 
 * @param token - JWT access token
 */
export const setAccessToken = (token: string): void => {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  
  // Decode token to get expiry time
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp) {
      localStorage.setItem(TOKEN_EXPIRY_KEY, (payload.exp * 1000).toString());
    }
  } catch (error) {
    console.error('[TokenManager] Failed to decode token:', error);
  }
};

/**
 * Get access token from localStorage
 * 
 * @returns Access token or null if not found
 */
export const getAccessToken = (): string | null => {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
};

/**
 * Store refresh token in localStorage
 * 
 * @param token - JWT refresh token
 */
export const setRefreshToken = (token: string): void => {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
};

/**
 * Get refresh token from localStorage
 * 
 * @returns Refresh token or null if not found
 */
export const getRefreshToken = (): string | null => {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
};

/**
 * Store ID token in localStorage
 * 
 * @param token - JWT ID token
 */
export const setIdToken = (token: string): void => {
  localStorage.setItem(ID_TOKEN_KEY, token);
};

/**
 * Get ID token from localStorage
 * 
 * @returns ID token or null if not found
 */
export const getIdToken = (): string | null => {
  return localStorage.getItem(ID_TOKEN_KEY);
};

/**
 * Store all tokens at once
 * 
 * @param accessToken - JWT access token
 * @param refreshToken - JWT refresh token
 * @param idToken - Optional JWT ID token
 */
export const setTokens = (
  accessToken: string,
  refreshToken: string,
  idToken?: string
): void => {
  setAccessToken(accessToken);
  setRefreshToken(refreshToken);
  
  if (idToken) {
    setIdToken(idToken);
  }
};

/**
 * Clear all tokens from localStorage
 * 
 * This should be called on logout to ensure no tokens remain.
 */
export const clearTokens = (): void => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(ID_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
};

/**
 * Get token expiry timestamp
 * 
 * @returns Expiry timestamp in milliseconds or null if not found
 */
export const getTokenExpiry = (): number | null => {
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  return expiry ? parseInt(expiry, 10) : null;
};

/**
 * Check if token is expired
 * 
 * @returns True if token is expired
 */
export const isTokenExpired = (): boolean => {
  const expiry = getTokenExpiry();
  
  if (!expiry) {
    return true;
  }
  
  return Date.now() >= expiry;
};

/**
 * Get time until token expires in seconds
 * 
 * @returns Seconds until expiry, or 0 if expired/not found
 */
export const getTimeUntilExpiry = (): number => {
  const expiry = getTokenExpiry();
  
  if (!expiry) {
    return 0;
  }
  
  const timeUntilExpiry = expiry - Date.now();
  return Math.max(0, Math.floor(timeUntilExpiry / 1000));
};

/**
 * Check if token should be refreshed
 * 
 * Returns true if token will expire within the threshold (default: 30 seconds)
 * 
 * @param threshold - Threshold in seconds (default: 30)
 * @returns True if token should be refreshed
 */
export const shouldRefreshToken = (threshold: number = 30): boolean => {
  const timeUntilExpiry = getTimeUntilExpiry();
  return timeUntilExpiry > 0 && timeUntilExpiry <= threshold;
};

/**
 * Decode JWT token payload
 * 
 * @param token - JWT token to decode
 * @returns Decoded payload or null if invalid
 */
export const decodeToken = (token: string): any | null => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload;
  } catch (error) {
    console.error('[TokenManager] Failed to decode token:', error);
    return null;
  }
};

/**
 * Get user information from access token
 * 
 * @returns User info object or null if token not found/invalid
 */
export const getUserFromToken = (): any | null => {
  const token = getAccessToken();
  
  if (!token) {
    return null;
  }
  
  const payload = decodeToken(token);
  
  if (!payload) {
    return null;
  }
  
  return {
    id: payload.sub,
    username: payload.preferred_username,
    email: payload.email,
    firstName: payload.given_name,
    lastName: payload.family_name,
    roles: payload.realm_access?.roles || [],
    name: payload.name,
  };
};

/**
 * Check if user has a specific role
 * 
 * @param role - Role to check
 * @returns True if user has the role
 */
export const hasRole = (role: string): boolean => {
  const user = getUserFromToken();
  return user?.roles?.includes(role) || false;
};

/**
 * Check if user has admin role
 * 
 * @returns True if user is admin
 */
export const isAdmin = (): boolean => {
  return hasRole('admin');
};

/**
 * Token manager object with all functions
 */
export const tokenManager = {
  setAccessToken,
  getAccessToken,
  setRefreshToken,
  getRefreshToken,
  setIdToken,
  getIdToken,
  setTokens,
  clearTokens,
  getTokenExpiry,
  isTokenExpired,
  getTimeUntilExpiry,
  shouldRefreshToken,
  decodeToken,
  getUserFromToken,
  hasRole,
  isAdmin,
};

export default tokenManager;
