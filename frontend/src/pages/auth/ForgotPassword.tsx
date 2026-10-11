import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, KeyRound, Mail } from 'lucide-react';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/forms/Input';
import { AuthCard, authLinkClass } from './AuthCard';

const ForgotPassword: React.FC = () => {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/password-reset/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({
          type: 'success',
          text: t('forgotPassword.success', 'If your email address exists in our database, you will receive a password reset link shortly.'),
        });
        setEmail(''); // Clear input on success
      } else {
        // Server might return 200 even for non-existent emails for security, but good to show errors from server.
        setMessage({ type: 'error', text: data.message || t('forgotPassword.error', 'An error occurred. Please try again.') });
      }
    } catch (error) {
      console.error('Password reset request failed:', error);
      setMessage({
        type: 'error',
        text: t('forgotPassword.networkError', 'Network error. Please check your connection and try again.'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard
      icon={KeyRound}
      title={t('forgotPassword.title', 'Forgot password?')}
      subtitle={t('forgotPassword.subtitle', 'Enter your email address and we will send you a link to reset your password.')}
      footer={
        <button
          type="button"
          onClick={() => navigate('/login')}
          className={`inline-flex items-center gap-1.5 ${authLinkClass}`}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('forgotPassword.backToLogin', 'Back to Login')}
        </button>
      }
    >
      <form onSubmit={handleSubmit}>
        {message && (
          <div className="mb-5">
            <Alert type={message.type} message={message.text} />
          </div>
        )}
        <Input
          id="email-address"
          name="email"
          type="email"
          autoComplete="email"
          required
          label={t('forgotPassword.email', 'Email address')}
          placeholder={t('forgotPassword.emailPlaceholder', 'Email address')}
          leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
        />
        <Button type="submit" size="lg" className="mt-2 w-full" disabled={isLoading} isLoading={isLoading}>
          {isLoading ? t('forgotPassword.submitting', 'Sending...') : t('forgotPassword.submit', 'Send Reset Link')}
        </Button>
      </form>
    </AuthCard>
  );
};

export default ForgotPassword;
