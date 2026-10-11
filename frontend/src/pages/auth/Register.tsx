import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import { Input } from '../../components/forms/Input';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { authService } from '../../api/services/auth.service'; // Import authService
import { AuthCard, authLinkClass } from './AuthCard';
// No need for AppContext dispatch on registration, typically just redirect to login

const Register = (): JSX.Element => {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '', // Changed from 'name' to match backend API expectation
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Validate username (updated from name)
  const validateForm = () => {
    if (!formData.username || !formData.email || !formData.password) {
      setError(t('register.errors.required', 'All fields are required.'));
      return false;
    }

    // Add username validation
    if (formData.username.length < 3) {
      setError(t('register.errors.usernameLength', 'Username must be at least 3 characters long.'));
      return false;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      setError(t('register.errors.usernameFormat', 'Username can only contain letters, numbers, and underscores.'));
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
        setError(t('register.errors.passwordMismatch', 'Passwords do not match.'));
        return false;
    }
    // Add more validation as needed (e.g., email format, password strength)
    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
        setIsLoading(false); // Ensure loading state is reset on validation failure
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      // API expects { username, email, password }
      const registrationData = {
        username: formData.username,
        email: formData.email,
        password: formData.password
      };
      const response = await authService.register(registrationData);

      navigate('/login', {
        state: {
          successMessage: response.message || t('register.success', 'Registration successful! Please log in.')
        }
      });
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || t('register.errors.failed', 'Registration failed. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  const { username, email, password, confirmPassword } = formData; // Destructure for easier use in JSX

  // Success message from login redirect
  const urlSuccessMessage = new URLSearchParams(window.location.search).get('successMessage');

  return (
    <AuthCard
      icon={UserPlus}
      title={t('register.title', 'Create your account')}
      subtitle={t('register.subtitle', 'Start tracking your time, invoices and expenses.')}
      footer={
        <p>
          {t('register.haveAccount', 'Already have an account?')}{' '}
          <button type="button" onClick={() => navigate('/login')} className={authLinkClass}>
            {t('register.signIn', 'Sign in')}
          </button>
        </p>
      }
    >
      <form onSubmit={handleSubmit}>
        {(error || urlSuccessMessage) && (
          <div className="mb-5 space-y-3">
            {error && <Alert type="error" message={error} />}
            {urlSuccessMessage && <Alert type="success" message={decodeURIComponent(urlSuccessMessage)} />}
          </div>
        )}

        <Input
          id="username"
          name="username"
          type="text"
          required
          label={t('register.username', 'Username')}
          placeholder={t('register.usernamePlaceholder', 'Username')}
          value={username}
          onChange={handleChange}
          disabled={isLoading}
          autoComplete="username"
        />

        <Input
          id="email"
          name="email"
          type="email"
          required
          label={t('register.email', 'Email address')}
          placeholder={t('register.emailPlaceholder', 'Email address')}
          value={email}
          onChange={handleChange}
          disabled={isLoading}
          autoComplete="email"
        />

        <Input
          id="password"
          name="password"
          type="password"
          required
          label={t('register.password', 'Password')}
          placeholder={t('register.passwordPlaceholder', 'Password')}
          value={password}
          onChange={handleChange}
          disabled={isLoading}
          autoComplete="new-password"
        />

        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          label={t('register.confirmPassword', 'Confirm password')}
          placeholder={t('register.confirmPasswordPlaceholder', 'Confirm Password')}
          value={confirmPassword}
          onChange={handleChange}
          disabled={isLoading}
          autoComplete="new-password"
        />

        <Button type="submit" size="lg" disabled={isLoading} isLoading={isLoading} className="mt-2 w-full">
          {isLoading ? t('register.submitting', 'Creating Account...') : t('register.submit', 'Sign up')}
        </Button>
      </form>
    </AuthCard>
  );
};

export default Register;
