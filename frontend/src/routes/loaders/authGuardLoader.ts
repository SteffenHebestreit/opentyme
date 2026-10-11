/**
 * @fileoverview Auth guard loader for protected routes.
 * 
 * Checks if user is authenticated before loading protected routes.
 * Redirects to login if not authenticated.
 * 
 * @module routes/loaders/authGuardLoader
 */

import { redirect, type LoaderFunctionArgs } from 'react-router-dom';
import { keycloak } from '@/config/keycloak.config';
import { authReady, isAuthReady } from '@/lib/authReady';

/**
 * Loader function to protect routes requiring authentication.
 * 
 * @returns null if authenticated, redirect to login if not
 */
export async function authGuardLoader({ request }: LoaderFunctionArgs) {
  // On a page reload this runs before Keycloak has restored the session.
  // Wait for that check instead of bouncing a signed-in user through /login
  // (which used to land them on the dashboard instead of the page they reloaded).
  if (!keycloak.authenticated && !isAuthReady()) {
    await authReady;
  }

  // Check if Keycloak is initialized and user is authenticated
  if (!keycloak.authenticated) {
    // Store the requested path to redirect back after login. Use the request's
    // URL: on an in-app navigation window.location still shows the previous page.
    const url = new URL(request.url);
    const currentPath = url.pathname + url.search;
    sessionStorage.setItem('redirectAfterLogin', currentPath);
    
    // Redirect to login page
    return redirect('/login');
  }

  // User is authenticated, allow route to load
  return null;
}
