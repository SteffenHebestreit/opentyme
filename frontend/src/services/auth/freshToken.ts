/**
 * @fileoverview Access tokens that are fresh when a request leaves.
 *
 * Browsers throttle timers in background tabs, so the periodic refresh in
 * AuthContext can fall behind. Requests call this first instead of trusting
 * whatever token is in storage.
 */

import { keycloak } from '@/config/keycloak.config';
import { getAccessToken, isTokenExpired, setTokens, shouldRefreshToken } from './tokenManager';

/**
 * Refresh the access token if it expires within `minValiditySeconds` (or
 * always, with `force`). Never throws — on failure the request goes out with
 * what is there and its 401 handling decides.
 */
export async function ensureFreshToken(minValiditySeconds = 30, force = false): Promise<void> {
  if (!keycloak.authenticated) return;
  // shouldRefreshToken() is false once the token has already expired — cover both
  const due = force || isTokenExpired() || shouldRefreshToken(minValiditySeconds);
  if (!due) return;
  try {
    const refreshed = await keycloak.updateToken(force ? -1 : minValiditySeconds);
    if (refreshed && keycloak.token && keycloak.refreshToken) {
      setTokens(keycloak.token, keycloak.refreshToken, keycloak.idToken);
    }
  } catch {
    // Refresh failed (session ended) — the caller's 401 handling decides.
  }
}

/** A token valid for at least `minValiditySeconds`, or null when signed out. */
export async function getFreshAccessToken(minValiditySeconds = 30, force = false): Promise<string | null> {
  await ensureFreshToken(minValiditySeconds, force);
  return getAccessToken();
}
