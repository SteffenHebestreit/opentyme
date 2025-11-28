import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Login Page
 * 
 * This page redirects users to Keycloak for authentication.
 * No credentials are handled by the frontend - all authentication
 * is managed by Keycloak directly.
 * 
 * Flow:
 * 1. User clicks "Sign in"
 * 2. Redirected to Keycloak login page
 * 3. After successful login, redirected back to application
 * 4. AuthContext handles token storage and user state
 */
const Login = (): JSX.Element => {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoadingAuth } = useAuth();

  /**
   * If user is already authenticated, redirect to intended page or dashboard
   */
  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated) {
      // First check for stored redirect path from authGuardLoader
      const redirectAfterLogin = sessionStorage.getItem('redirectAfterLogin');
      if (redirectAfterLogin) {
        sessionStorage.removeItem('redirectAfterLogin');
        console.log('[Login] User is already authenticated, redirecting to stored path:', redirectAfterLogin);
        navigate(redirectAfterLogin, { replace: true });
        return;
      }
      
      // Otherwise get the page user was trying to access from location state
      const from = (location.state as any)?.from?.pathname || '/dashboard';
      console.log('[Login] User is already authenticated, redirecting to:', from);
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isLoadingAuth, navigate, location]);

  /**
   * Handle login button click
   * 
   * Calls keycloak.login() which redirects to Keycloak login page.
   * After successful authentication, user is redirected back to the app.
   */
  const handleLogin = () => {
    console.log('[Login] Redirecting to Keycloak login...');
    login();
  };

  // Show loading state while checking authentication
  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">{t('login.checkingAuth')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-4xl font-extrabold text-gray-900 dark:bg-gradient-to-r dark:from-purple-200 dark:to-pink-200 dark:bg-clip-text dark:text-transparent">
            {t('login.title')}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            {t('login.subtitle')}
          </p>
        </div>

        <div className="card">
          <div className="space-y-6">
            <div className="text-center">
              <svg
                className="mx-auto h-16 w-16 text-purple-600 dark:text-purple-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
                {t('login.keycloakAuth')}
              </h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {t('login.keycloakDescription')}
              </p>
            </div>

            <Button
              onClick={handleLogin}
              className="btn w-full"
            >
              {t('login.signInButton')}
            </Button>

            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('login.noAccount')}{' '}
                <button
                  type="button"
                  onClick={() => navigate('/register')}
                  className="font-medium text-purple-700 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 transition-colors"
                >
                  {t('login.signUp')}
                </button>
              </p>
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-gray-500 dark:text-gray-400">
          <p>{t('login.poweredBy')}</p>
          <p className="mt-1">{t('login.enterpriseGrade')}</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
