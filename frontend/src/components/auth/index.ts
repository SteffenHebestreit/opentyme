/**
 * Authentication Components Module
 * 
 * Components related to authentication and route protection.
 * 
 * @module components/auth
 * 
 * @example
 * // Protect a route with AuthGuard
 * import { AuthGuard } from '@/components/auth';
 * 
 * <Route path="/dashboard" element={
 *   <AuthGuard>
 *     <Dashboard />
 *   </AuthGuard>
 * } />
 */

// Route protection component
export { default as AuthGuard } from './AuthGuard';