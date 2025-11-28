/**
 * @fileoverview Auth guard loader for protected routes.
 * 
 * Checks if user is authenticated before loading protected routes.
 * Redirects to login if not authenticated.
 * 
 * @module routes/loaders/authGuardLoader
 */

import { redirect } from 'react-router-dom';
import { keycloak } from '@/config/keycloak.config';

/**
 * Loader function to protect routes requiring authentication.
 * 
 * @returns null if authenticated, redirect to login if not
 */
export async function authGuardLoader() {
  // Check if Keycloak is initialized and user is authenticated
  if (!keycloak.authenticated) {
    // Store the current path to redirect back after login
    const currentPath = window.location.pathname + window.location.search;
    sessionStorage.setItem('redirectAfterLogin', currentPath);
    
    // Redirect to login page
    return redirect('/login');
  }

  // User is authenticated, allow route to load
  return null;
}
