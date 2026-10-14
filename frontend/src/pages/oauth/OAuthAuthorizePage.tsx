/**
 * @fileoverview OAuth consent for MCP clients (/oauth/authorize).
 *
 * An app that connects to OpenTyme through OAuth (e.g. a claude.ai
 * connector) sends the user here. They see which app asks — its name is
 * self-declared, so also where it will send them back — and choose what it
 * may do, exactly as for an API token. Approving issues an ordinary API token
 * to the app; it then appears under Configuration → API tokens.
 *
 * @module pages/oauth/OAuthAuthorizePage
 */

import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { SkeletonItem } from '../../components/common/Skeleton';
import { ApiTokenPermissionsEditor, TokenAccessChoice } from '../../components/admin/api-tokens/ApiTokenPermissionsEditor';
import { ExpiryField } from '../../components/admin/api-tokens/ExpiryField';
import {
  apiErrorBody,
  DEFAULT_EXPIRY,
  ExpiryChoice,
  expiryToIso,
  presetResources,
} from '../../components/admin/api-tokens/apiTokenHelpers';
import { useApiTokenCatalog } from '../../hooks/api/useApiTokens';
import {
  approveAuthorization,
  AuthorizationDescription,
  denyAuthorization,
  describeAuthorization,
} from '../../api/services/oauth.service';
import { leaveTo } from '../../lib/navigate';

/** An error the client should hear about comes with the URL to send the user to. */
function errorOf(err: unknown): { message?: string; redirect?: string } {
  const body = apiErrorBody(err) as { message?: string; redirect?: string; error_description?: string };
  return { message: body.error_description ?? body.message, redirect: body.redirect };
}

const OAuthAuthorizePage: FC = () => {
  const { t } = useTranslation('settings');
  const [searchParams] = useSearchParams();
  const request = useMemo(() => Object.fromEntries(searchParams.entries()), [searchParams]);
  const { data: catalog } = useApiTokenCatalog();

  const [description, setDescription] = useState<AuthorizationDescription | null>(null);
  const [failure, setFailure] = useState<{ message?: string; redirect?: string } | null>(null);
  const [access, setAccess] = useState<TokenAccessChoice>({ resources: {}, capabilities: ['mcp'], approvalMode: 'self' });
  const [expiry, setExpiry] = useState<ExpiryChoice>(DEFAULT_EXPIRY);
  const [customDate, setCustomDate] = useState('');
  const [expiryError, setExpiryError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    describeAuthorization(request)
      .then(setDescription)
      .catch((err: unknown) => setFailure(errorOf(err)));
  }, [request]);

  // Start from read-only access; the user can widen or narrow it.
  useEffect(() => {
    if (catalog) setAccess((prev) => ({ ...prev, resources: presetResources('readOnly', catalog) }));
  }, [catalog]);

  const go = leaveTo;

  const allow = async () => {
    const expiresAt = expiryToIso(expiry, customDate);
    if (expiresAt === undefined) {
      setExpiryError(t('admin.apiTokens.form.customDateRequired'));
      return;
    }
    setBusy(true);
    try {
      go(
        await approveAuthorization(request, {
          permissions: { resources: access.resources, capabilities: access.capabilities },
          approval_mode: access.approvalMode,
          expires_at: expiresAt,
        })
      );
    } catch (err: unknown) {
      setBusy(false);
      setFailure(errorOf(err));
    }
  };

  const deny = async () => {
    setBusy(true);
    try {
      go(await denyAuthorization(request));
    } catch (err: unknown) {
      setBusy(false);
      setFailure(errorOf(err));
    }
  };

  if (failure) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-6">
        <Alert type="error" title={t('oauth.failedTitle')} message={failure.message ?? t('oauth.failed')} />
        {failure.redirect && (
          <Button variant="secondary" onClick={() => go(failure.redirect!)}>
            {t('oauth.backToApp')}
          </Button>
        )}
      </div>
    );
  }

  if (!description) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 py-6" aria-busy="true">
        <SkeletonItem className="h-8 w-2/3" />
        <SkeletonItem className="h-4 w-full" />
        <SkeletonItem className="h-40 w-full" />
      </div>
    );
  }

  const { client } = description;
  return (
    <div className="mx-auto max-w-3xl space-y-8 py-6">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/20">
          <KeyRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">
            {t('oauth.title', { client: client.name })}
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{t('oauth.intro', { client: client.name })}</p>
          <p className="mt-3 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('oauth.verify', { client: client.name, host: client.redirectHost })}</span>
          </p>
        </div>
      </div>

      <ApiTokenPermissionsEditor value={access} onChange={setAccess} lockedCapabilities={['mcp']} />

      <ExpiryField
        choice={expiry}
        customDate={customDate}
        onChoiceChange={(choice) => {
          setExpiry(choice);
          setExpiryError(undefined);
        }}
        onCustomDateChange={(ymd) => {
          setCustomDate(ymd);
          setExpiryError(undefined);
        }}
        error={expiryError}
      />

      <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-6 sm:flex-row sm:justify-end dark:border-gray-800">
        <Button variant="secondary" onClick={deny} disabled={busy}>
          {t('oauth.deny')}
        </Button>
        <Button onClick={allow} isLoading={busy} disabled={!catalog}>
          {t('oauth.allow')}
        </Button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{t('oauth.revokeHint')}</p>
    </div>
  );
};

export default OAuthAuthorizePage;
