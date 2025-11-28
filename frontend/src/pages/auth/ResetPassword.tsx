import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/forms/Input';

const ResetPasswordPage: React.FC = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  // Get token from URL query parameters
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const token = queryParams.get('token');
    if (!token) {
      setMessage({ type: 'error', text: 'Password reset token is missing. Please check your email link.' });
    }
    // We don't need to store the token in state for the form submission,
    // but we might want to validate it or show an error if it's missing.
  }, [location.search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    if (!newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: 'Please fill in all fields.' });
      setIsLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      setIsLoading(false);
      return;
    }
    
    const queryParams = new URLSearchParams(location.search);
    const token = queryParams.get('token');

    if (!token) {
        setMessage({ type: 'error', text: 'Password reset token is missing. Please try initiating the password reset process again.' });
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
        setMessage({ type: 'success', text: data.message || 'Password has been successfully reset. You can now log in with your new password.' });
        // Optionally redirect to login after a delay
        setTimeout(() => navigate('/login'), 3000); 
      } else {
        setMessage({ type: 'error', text: data.message || 'An error occurred. Please try again or request a new reset link.' });
      }
    } catch (error) {
      console.error('Password reset failed:', error);
      setMessage({ type: 'error', text: 'Network error. Please check your connection and try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Reset Password
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your new password below.
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {message && (
            <Alert type={message.type} message={message.text} />
          )}
          
          {/* Conditionally render inputs only if token is present, otherwise show error */}
          {(!message || message.type !== 'error' || !message.text.includes('token is missing')) ? ( 
             <>
               <div className="space-y-4">
                 <Input
                   id="new-password"
                   name="newPassword"
                   type="password"
                   autoComplete="new-password"
                   required
                   placeholder="New password"
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
                   placeholder="Confirm new password"
                   value={confirmPassword}
                   onChange={(e) => setConfirmPassword(e.target.value)}
                   disabled={isLoading}
                 />
               </div>
             </>
          ) : (
            <Alert type="error" message={message?.text || "Invalid reset link."} />
          )}

          { (!message || message.type !== 'error' || !message.text.includes('token is missing')) && (
             <div>
                <Button
                  type="submit"
                  className="group w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  disabled={isLoading}
                >
                  {isLoading ? 'Resetting...' : 'Reset Password'}
                </Button>
             </div>
          )}

          <div className="text-center">
            <button
              type="button"
              onClick={() => navigate('/forgot-password')}
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Back to Forgot Password?
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
