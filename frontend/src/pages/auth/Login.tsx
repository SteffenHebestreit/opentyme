import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';
import { AuthCard, authLinkClass } from './AuthCard';

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

  /** Message handed over by the registration page after a successful sign-up */
  const successMessage = (location.state as { successMessage?: string } | null)?.successMessage;

  /**
   * If user is already authenticated, redirect to intended page or dashboard
   */
  // Redirect once. In development React runs effects twice; the second run used
  // to find the stored path already consumed and sent the user to /dashboard.
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated && !redirectedRef.current) {
      redirectedRef.current = true;
      // First check for stored redirect path from authGuardLoader
      const redirectAfterLogin = sessionStorage.getItem('redirectAfterLogin');
      if (redirectAfterLogin) {
        sessionStorage.removeItem('redirectAfterLogin');
        navigate(redirectAfterLogin, { replace: true });
        return;
      }

      // Otherwise get the page user was trying to access from location state
      const from = (location.state as any)?.from?.pathname || '/dashboard';
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
    login();
  };

  // Show loading state while checking authentication
  if (isLoadingAuth) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-4 py-24 text-center">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('login.checkingAuth')}</p>
      </div>
    );
  }

  return (
    <AuthCard
      title={t('login.title')}
      subtitle={t('login.subtitle')}
      footer={
        <p>
          {t('login.noAccount')}{' '}
          <button type="button" onClick={() => navigate('/register')} className={authLinkClass}>
            {t('login.signUp')}
          </button>
        </p>
      }
    >
      <div className="space-y-6">
        {successMessage && <Alert type="success" message={successMessage} />}

        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t('login.keycloakAuth')}</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('login.keycloakDescription')}</p>
          </div>
        </div>

        <Button
          type="button"
          size="lg"
          onClick={handleLogin}
          className="w-full"
          leftIcon={<LogIn className="h-5 w-5" aria-hidden="true" />}
        >
          {t('login.signInButton')}
        </Button>

        <div className="border-t border-gray-100 pt-5 text-center text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
          <p className="font-medium text-gray-600 dark:text-gray-300">{t('login.poweredBy')}</p>
          <p className="mt-1">{t('login.enterpriseGrade')}</p>
        </div>
      </div>
    </AuthCard>
  );
};

export default Login;
