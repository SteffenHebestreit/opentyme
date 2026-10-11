import React from 'react';
import { useTranslation } from 'react-i18next';
import { IdCard, KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { PageHeader } from '../../components/common/PageHeader';
import { SkeletonItem } from '../../components/common/Skeleton';
import { SettingsSection } from '../../components/admin/SettingsSection';
import { useAuth } from '../../contexts/AuthContext';
import { keycloak } from '../../config/keycloak.config';
import { cn } from '../../lib/cn';

/** One read-only account attribute. */
const Detail: React.FC<{ label: string; value: string; mono?: boolean; className?: string }> = ({
  label,
  value,
  mono,
  className,
}) => (
  <div className={cn('min-w-0', className)}>
    <dt className="eyebrow">{label}</dt>
    <dd
      className={cn(
        'mt-1 break-words text-sm text-gray-900 dark:text-gray-100',
        mono && 'break-all font-mono text-xs text-gray-700 dark:text-gray-300'
      )}
    >
      {value}
    </dd>
  </div>
);

const ProfilePage: React.FC = () => {
  const { t } = useTranslation('settings');
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
      <div className="space-y-6" aria-busy="true">
        <div className="space-y-2">
          <SkeletonItem className="h-7 w-40" />
          <SkeletonItem className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <SkeletonItem className="h-56 rounded-xl" />
          <SkeletonItem className="h-56 rounded-xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  const initial = user.firstName?.[0] || user.username[0].toUpperCase();

  return (
    <div className="space-y-6">
      <PageHeader title={t('profilePage.title')} subtitle={t('profilePage.subtitle')} icon={UserRound} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        {/* Identity */}
        <div className="surface flex flex-col items-center px-6 py-8 text-center">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-3xl font-semibold text-brand-600 ring-1 ring-inset ring-brand-600/15 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/20"
            aria-hidden="true"
          >
            {initial}
          </div>
          <h2 className="mt-4 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
            {user.name || user.username}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">@{user.username}</p>
          {user.email && (
            <p className="mt-3 max-w-full truncate text-sm text-gray-600 dark:text-gray-300">{user.email}</p>
          )}
        </div>

        <div className="space-y-6 lg:col-span-2">
          {/* Profile Details */}
          <SettingsSection
            icon={IdCard}
            title={t('profilePage.accountDetails')}
            description={t('profilePage.accountDetailsHint')}
          >
            <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              <Detail label={t('profilePage.email')} value={user.email} />
              <Detail label={t('profilePage.username')} value={user.username} />
              {user.firstName && <Detail label={t('profilePage.firstName')} value={user.firstName} />}
              {user.lastName && <Detail label={t('profilePage.lastName')} value={user.lastName} />}
              <Detail label={t('profilePage.userId')} value={user.id} mono className="sm:col-span-2" />
            </dl>
          </SettingsSection>

          {/* Actions */}
          <SettingsSection
            icon={ShieldCheck}
            title={t('profilePage.security')}
            description={t('profilePage.securityHint')}
            footer={
              <Button
                type="button"
                onClick={handleChangePassword}
                variant="primary"
                leftIcon={<KeyRound className="h-4 w-4" />}
                className="w-full sm:w-auto"
              >
                {t('profilePage.changePassword')}
              </Button>
            }
          />

          {/* Info Banner */}
          <Alert
            type="info"
            title={t('profilePage.keycloakTitle')}
            message={t('profilePage.keycloakText')}
          />
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
