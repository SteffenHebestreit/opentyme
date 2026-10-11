import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/forms/Input';
import { AuthCard, authLinkClass } from './AuthCard';

/** Status message; `tokenMissing` marks the "link has no token" state, which hides the form. */
type ResetMessage = { type: 'success' | 'error'; text: string; tokenMissing?: boolean };

const ResetPasswordPage: React.FC = () => {
  const { t } = useTranslation('auth');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<ResetMessage | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  // Get token from URL query parameters
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const token = queryParams.get('token');
    if (!token) {
      setMessage({
        type: 'error',
        text: t('resetPassword.errors.tokenMissing', 'Password reset token is missing. Please check your email link.'),
        tokenMissing: true,
      });
    }
    // We don't need to store the token in state for the form submission,
    // but we might want to validate it or show an error if it's missing.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-check when the URL changes
  }, [location.search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    if (!newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: t('resetPassword.errors.fillAll', 'Please fill in all fields.') });
      setIsLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: t('resetPassword.errors.mismatch', 'Passwords do not match.') });
      setIsLoading(false);
      return;
    }

    const queryParams = new URLSearchParams(location.search);
    const token = queryParams.get('token');

    if (!token) {
        setMessage({
          type: 'error',
          text: t(
            'resetPassword.errors.tokenMissingRetry',
            'Password reset token is missing. Please try initiating the password reset process again.'
          ),
          tokenMissing: true,
        });
        setIsLoading(false);
        return;
    }

    try {
      const response = await fetch('/api/password-reset/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({
          type: 'success',
          text:
            data.message ||
            t('resetPassword.success', 'Password has been successfully reset. You can now log in with your new password.'),
        });
        // Optionally redirect to login after a delay
        setTimeout(() => navigate('/login'), 3000);
      } else {
        setMessage({
          type: 'error',
          text:
            data.message ||
            t('resetPassword.errors.failed', 'An error occurred. Please try again or request a new reset link.'),
        });
      }
    } catch (error) {
      console.error('Password reset failed:', error);
      setMessage({
        type: 'error',
        text: t('resetPassword.errors.networkError', 'Network error. Please check your connection and try again.'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Without a token there is nothing to submit — show the error and a way back instead of the form
  const tokenMissing = message?.type === 'error' && message.tokenMissing === true;

  return (
    <AuthCard
      icon={LockKeyhole}
      title={t('resetPassword.title', 'Reset password')}
      subtitle={t('resetPassword.subtitle', 'Enter your new password below.')}
      footer={
        <button
          type="button"
          onClick={() => navigate('/forgot-password')}
          className={`inline-flex items-center gap-1.5 ${authLinkClass}`}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('resetPassword.requestNewLink', 'Request a new reset link')}
        </button>
      }
    >
      <form onSubmit={handleSubmit}>
        {tokenMissing ? (
          <Alert
            type="error"
            message={message?.text || t('resetPassword.errors.invalidLink', 'Invalid reset link.')}
          />
        ) : (
          <>
            {message && (
              <div className="mb-5">
                <Alert type={message.type} message={message.text} />
              </div>
            )}
            <Input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              label={t('resetPassword.newPassword', 'New password')}
              placeholder={t('resetPassword.newPasswordPlaceholder', 'New password')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isLoading}
            />
            <Input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              label={t('resetPassword.confirmPassword', 'Confirm new password')}
              placeholder={t('resetPassword.confirmPasswordPlaceholder', 'Confirm new password')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
            />
            <Button type="submit" size="lg" className="mt-2 w-full" disabled={isLoading} isLoading={isLoading}>
              {isLoading ? t('resetPassword.submitting', 'Resetting...') : t('resetPassword.submit', 'Reset Password')}
            </Button>
          </>
        )}
      </form>
    </AuthCard>
  );
};

export default ResetPasswordPage;
