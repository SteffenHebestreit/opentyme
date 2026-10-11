import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, PlugZap, XCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/common/Button';
import type { ConnectionTestResult } from '@/api/services/settings.service';
import { cn } from '@/lib/cn';

interface ConnectionTestProps {
  /** Runs the test against the values currently in the form */
  run: () => Promise<ConnectionTestResult>;
  /** Offer the server's models as one-click choices (AI only) */
  onPickModel?: (model: string) => void;
  disabled?: boolean;
}

/** "Test connection" button with an inline, translated result. */
export function ConnectionTest({ run, onPickModel, disabled }: ConnectionTestProps) {
  const { t } = useTranslation('settings');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);

  const message = (r: ConnectionTestResult): string => {
    switch (r.code) {
      case 'INVALID_URL':
        return t('admin.general.test.invalidUrl', 'This is not a valid http(s) URL.');
      case 'LLM_UNREACHABLE':
      case 'STT_UNREACHABLE':
        return t('admin.general.test.unreachable', 'The server is not reachable at this URL.');
      case 'LLM_TIMEOUT':
      case 'STT_TIMEOUT':
        return t('admin.general.test.timeout', 'The server did not answer in time.');
      case 'LLM_AUTH':
        return t('admin.general.test.auth', 'The server rejected the API key.');
      case 'LLM_MODEL':
        return t('admin.general.test.modelMissing', 'Connected, but the model is not offered by this server.');
      default:
        return r.ok
          ? t('admin.general.test.ok', 'Connected')
          : r.message || t('admin.general.test.failed', 'The test failed.');
    }
  };

  const onRun = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await run());
    } catch {
      setResult({ ok: false, message: t('admin.general.test.failed', 'The test failed.') });
    } finally {
      setBusy(false);
    }
  };

  const tone = !result ? null : !result.ok ? 'error' : result.modelFound === false ? 'warning' : 'success';
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'warning' ? AlertTriangle : XCircle;

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onRun}
        isLoading={busy}
        disabled={disabled}
        leftIcon={<PlugZap className="h-4 w-4" aria-hidden="true" />}
      >
        {t('admin.general.test.button', 'Test connection')}
      </Button>
      {result && tone && (
        <div
          role="status"
          className={cn(
            'animate-fade-in rounded-lg border px-3 py-2 text-sm',
            tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200',
            tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200',
            tone === 'error' && 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200'
          )}
        >
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="font-medium">{message(result)}</span>
            {result.ok && typeof result.latencyMs === 'number' && (
              <span className="ml-auto text-xs tabular-nums opacity-70">{result.latencyMs} ms</span>
            )}
          </div>
          {onPickModel && result.ok && result.models && result.models.length > 0 && (
            <div className="mt-2">
              <p className="text-xs opacity-80">{t('admin.general.test.availableModels', 'Models on this server — click to use:')}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {result.models.map((model) => (
                  <button
                    key={model}
                    type="button"
                    onClick={() => onPickModel(model)}
                    className="rounded-md border border-current/20 bg-white/60 px-2 py-0.5 font-mono text-xs transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 dark:bg-black/20 dark:hover:bg-black/40"
                  >
                    {model}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
