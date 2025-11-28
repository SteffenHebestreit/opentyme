import React from 'react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/forms/Input';
import { useAuth } from '../../contexts/AuthContext';
import { keycloak } from '../../config/keycloak.config';

const ProfilePage: React.FC = () => {
  const { user, isLoadingAuth } = useAuth();

  const handleChangePassword = () => {
    if (keycloak.authenticated) {
      // Use Keycloak's login with action parameter for password update
      keycloak.login({
        action: 'UPDATE_PASSWORD',
        redirectUri: window.location.href
      });
    }
  };

  if (isLoadingAuth || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-lg text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl w-full mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Profile</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            View and manage your account information
          </p>
        </div>

        {/* Profile Card */}
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg overflow-hidden">
          {/* Profile Header */}
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-8">
            <div className="flex items-center space-x-4">
              {/* Avatar */}
              <div className="w-20 h-20 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-3xl font-bold text-purple-600 dark:text-purple-400">
                {user.firstName?.[0] || user.username[0].toUpperCase()}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {user.name || user.username}
                </h2>
                <p className="text-purple-100">@{user.username}</p>
              </div>
            </div>
          </div>

          {/* Profile Details */}
          <div className="px-6 py-8 space-y-6">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email Address
              </label>
              <Input
                value={user.email}
                disabled
                type="email"
              />
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Username
              </label>
              <Input
                value={user.username}
                disabled
                type="text"
              />
            </div>

            {/* First Name */}
            {user.firstName && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  First Name
                </label>
                <Input
                  value={user.firstName}
                  disabled
                  type="text"
                />
              </div>
            )}

            {/* Last Name */}
            {user.lastName && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Last Name
                </label>
                <Input
                  value={user.lastName}
                  disabled
                  type="text"
                />
              </div>
            )}

            {/* User ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                User ID
              </label>
              <Input
                value={user.id}
                disabled
                type="text"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Account Security
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Update your password through Keycloak's secure authentication system
                </p>
              </div>
              <Button
                onClick={handleChangePassword}
                variant="primary"
              >
                Change Password
              </Button>
            </div>
          </div>

          {/* Info Banner */}
          <div className="px-6 py-4 bg-purple-50 dark:bg-purple-900/20 border-t border-purple-100 dark:border-purple-800">
            <div className="flex items-start space-x-3">
              <svg className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-purple-900 dark:text-purple-200">
                  Authentication Managed by Keycloak
                </h4>
                <p className="mt-1 text-sm text-purple-700 dark:text-purple-300">
                  Your account information is managed through Keycloak. Profile details are read-only and synchronized from your Keycloak account. To change your password or enable two-factor authentication, click "Change Password" above.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
