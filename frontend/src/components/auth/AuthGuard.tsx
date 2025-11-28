import React, { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Props for the AuthGuard component.
 * 
 * @interface AuthGuardProps
 * @property {ReactNode} children - Protected content to render if authenticated
 */
interface AuthGuardProps {
  children: ReactNode;
}

/**
 * Route protection component that enforces authentication.
 * 
 * Prevents unauthenticated users from accessing protected routes.
 * Shows loading state while checking authentication status.
 * Redirects to login page with return location if not authenticated.
 * 
 * Uses useAuth hook to check authentication status and loading state.
 * Preserves the intended destination in location state for post-login redirect.
 * 
 * @component
 * @example
 * // Protect a single route
 * <Route path="/dashboard" element={
 *   <AuthGuard>
 *     <Dashboard />
 *   </AuthGuard>
 * } />
 * 
 * @example
 * // Protect multiple nested routes
 * <Route element={<AuthGuard><Outlet /></AuthGuard>}>
 *   <Route path="/profile" element={<Profile />} />
 *   <Route path="/settings" element={<Settings />} />
 * </Route>
 * 
 * @example
 * // After login redirect (in Login component)
 * const location = useLocation();
 * const from = location.state?.from?.pathname || '/';
 * navigate(from, { replace: true });
 * 
 * @param {AuthGuardProps} props - Component props
 * @returns {JSX.Element} Protected children, loading state, or redirect to login
 */
const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default AuthGuard;
