/**
 * Centralized authentication utility
 * Provides consistent localStorage key management for auth tokens and user data
 */

export const AUTH_STORAGE_KEYS = {
  TOKEN: 'auth_token',
  USER: 'user',
  REFRESH_TOKEN: 'refresh_token', // For future use
  THEME: 'theme_preference'
} as const;

/**
 * Stores authentication token in localStorage
 * @param token JWT token string
 */
export const setAuthToken = (token: string): void => {
  localStorage.setItem(AUTH_STORAGE_KEYS.TOKEN, token);
};

/**
 * Retrieves authentication token from localStorage
 * @returns JWT token or null if not found
 */
export const getAuthToken = (): string | null => {
  return localStorage.getItem(AUTH_STORAGE_KEYS.TOKEN);
};

/**
 * Stores refresh token in localStorage
 * @param refreshToken Refresh token string
 */
export const setRefreshToken = (refreshToken: string): void => {
  localStorage.setItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
};

/**
 * Retrieves refresh token from localStorage
 * @returns Refresh token or null if not found
 */
export const getRefreshToken = (): string | null => {
  return localStorage.getItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN);
};

/**
 * Stores user data in localStorage
 * @param user User object
 */
export const setUser = (user: any): void => {
  localStorage.setItem(AUTH_STORAGE_KEYS.USER, JSON.stringify(user));
};

/**
 * Retrieves user data from localStorage
 * @returns User object or null if not found
 */
export const getUser = (): any | null => {
  const userStr = localStorage.getItem(AUTH_STORAGE_KEYS.USER);
  if (!userStr) return null;
  
  try {
    return JSON.parse(userStr);
  } catch (error) {
    console.error('Failed to parse user data:', error);
    return null;
  }
};

/**
 * Removes all authentication data from localStorage
 * Call this on logout
 */
export const clearAuth = (): void => {
  localStorage.removeItem(AUTH_STORAGE_KEYS.TOKEN);
  localStorage.removeItem(AUTH_STORAGE_KEYS.USER);
  localStorage.removeItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN);
};

/**
 * Checks if user is authenticated (has valid token)
 * @returns boolean indicating if token exists
 */
export const isAuthenticated = (): boolean => {
  const token = getAuthToken();
  return token !== null && token.length > 0;
};

/**
 * Decodes JWT token (without verification)
 * @param token JWT token string
 * @returns Decoded token payload or null
 */
export const decodeToken = (token: string): any | null => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to decode token:', error);
    return null;
  }
};

/**
 * Checks if token is expired
 * @param token JWT token string
 * @returns boolean indicating if token is expired
 */
export const isTokenExpired = (token: string): boolean => {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return true;
  
  const expirationTime = decoded.exp * 1000; // Convert to milliseconds
  return Date.now() >= expirationTime;
};

/**
 * Gets token expiration time
 * @param token JWT token string
 * @returns Date object of expiration or null
 */
export const getTokenExpiration = (token: string): Date | null => {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return null;
  
  return new Date(decoded.exp * 1000);
};
