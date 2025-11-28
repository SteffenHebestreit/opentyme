import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '../../components/forms/Input';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { authService } from '../../api/services/auth.service'; // Import authService
// No need for AppContext dispatch on registration, typically just redirect to login

const Register = (): JSX.Element => {
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
      setError('All fields are required.');
      return false;
    }
    
    // Add username validation
    if (formData.username.length < 3) {
      setError('Username must be at least 3 characters long.');
      return false;
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      setError('Username can only contain letters, numbers, and underscores.');
      return false;
    }
    
    if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match.');
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
          successMessage: response.message || 'Registration successful! Please log in.' 
        } 
      });
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const { username, email, password, confirmPassword } = formData; // Destructure for easier use in JSX

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-4xl font-extrabold bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent">
            Create your account
          </h2>
        </div>
        {error && <Alert type="error" message={error} />}
        
        {/* Success message from login redirect */}
        {new URLSearchParams(window.location.search).get('successMessage') && (
           <Alert 
             type="success" 
             message={decodeURIComponent(new URLSearchParams(window.location.search).get('successMessage') || '')}
          />
        )}

        <form className="mt-8 space-y-6 card" onSubmit={handleSubmit}>
          <div className="space-y-4">
             <Input
              id="username"
              name="username"
              type="text"
              required
              placeholder="Username"
              value={username}
              onChange={handleChange}
              disabled={isLoading}
              className="form-control"
              autoComplete="username"
            />
            
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="Email address"
              value={email}
              onChange={handleChange}
              disabled={isLoading}
              className="form-control"
              autoComplete="email"
            />

            <Input
              id="password"
              name="password"
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={handleChange}
              disabled={isLoading}
              className="form-control"
              autoComplete="new-password"
            />
            
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={handleChange}
              disabled={isLoading}
              className="form-control"
              autoComplete="new-password"
            />
          </div>

          <div>
            <Button
              type="submit"
              disabled={isLoading}
              className="btn w-full"
            >
              {isLoading ? 'Creating Account...' : 'Sign up'}
            </Button>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-400">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="font-medium text-purple-400 hover:text-purple-300 transition-colors"
              >
                Sign in
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
