/**
 * Plugins Management Page
 *
 * Admin page for viewing and managing installed plugins.
 * Shows a settings form (driven by the addon manifest schema) when a plugin
 * with `hasSettings = true` is selected.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, Package, Power, PowerOff, Puzzle, Save } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Alert } from '../../components/common/Alert';
import { StatCard } from '../../components/common/StatCard';
import { EmptyState } from '../../components/common/EmptyState';
import { SkeletonItem } from '../../components/common/Skeleton';
import { fieldClasses, fieldHelperClass, fieldLabelClass } from '../../components/forms/fieldStyles';
import { SettingsHeader, SettingsSwitch } from '../../components/admin/SettingsSection';
import { toast } from '../../lib/toast';
import { cn } from '../../lib/cn';
import { usePlugins, usePlugin, useEnablePlugin, useDisablePlugin, useUpdatePluginSettings } from '../../api/hooks/usePlugins';

// ---------------------------------------------------------------------------
// Dynamic settings form
// ---------------------------------------------------------------------------

interface SchemaField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  default?: any;
  enum?: string[];
  secret?: boolean;
  required?: boolean;
  description?: string;
  label?: string;
}

interface PluginSettingsFormProps {
  pluginName: string;
  schema: Record<string, SchemaField>;
  initialValues: Record<string, any>;
  onSaved: () => void;
}

function PluginSettingsForm({ pluginName, schema, initialValues, onSaved }: PluginSettingsFormProps) {
  const { t } = useTranslation('settings');
  const [values, setValues] = useState<Record<string, any>>(() => {
    const defaults: Record<string, any> = {};
    Object.entries(schema).forEach(([key, field]) => {
      defaults[key] = initialValues[key] ?? field.default ?? '';
    });
    return defaults;
  });
  const updateSettings = useUpdatePluginSettings(pluginName);

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync(values);
      toast.success(t('admin.plugins.settingsSaved'));
      onSaved();
    } catch {
      toast.error(t('admin.plugins.settingsSaveError'));
    }
  };

  const set = (key: string, value: any) => setValues((prev) => ({ ...prev, [key]: value }));

  const fieldEntries = Object.entries(schema);

  return (
    <div className="space-y-4">
      {fieldEntries.map(([key, field]) => {
        const label = field.label || key;
        const value = values[key];
        const id = `plugin-${pluginName}-${key}`;

        if (field.type === 'boolean') {
          return (
            <label key={key} className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={!!value}
                onChange={(e) => set(key, e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 accent-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900"
              />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
                {field.description && (
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{field.description}</p>
                )}
              </div>
            </label>
          );
        }

        if (field.type === 'number') {
          return (
            <div key={key}>
              <label htmlFor={id} className={fieldLabelClass()}>{label}</label>
              <input
                id={id}
                type="number"
                value={value ?? ''}
                step="any"
                onChange={(e) => set(key, parseFloat(e.target.value))}
                className={cn(fieldClasses(), 'tabular-nums')}
              />
              {field.description && <p className={fieldHelperClass}>{field.description}</p>}
            </div>
          );
        }

        // string — select if enum, password if secret, else text
        if (field.enum?.length) {
          return (
            <div key={key}>
              <label htmlFor={id} className={fieldLabelClass()}>{label}</label>
              <select
                id={id}
                value={value ?? ''}
                onChange={(e) => set(key, e.target.value)}
                className={fieldClasses()}
              >
                {field.enum.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
              {field.description && <p className={fieldHelperClass}>{field.description}</p>}
            </div>
          );
        }

        return (
          <div key={key}>
            <label htmlFor={id} className={fieldLabelClass()}>{label}</label>
            <input
              id={id}
              type={field.secret ? 'password' : 'text'}
              value={value ?? ''}
              onChange={(e) => set(key, e.target.value)}
              className={cn(fieldClasses(), 'font-mono')}
            />
            {field.description && <p className={fieldHelperClass}>{field.description}</p>}
          </div>
        );
      })}

      <div className="flex justify-end border-t border-gray-100 pt-4 dark:border-gray-800">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleSave}
          isLoading={updateSettings.isPending}
          leftIcon={<Save className="h-4 w-4" />}
        >
          {t('admin.plugins.saveSettings')}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plugin detail modal
// ---------------------------------------------------------------------------

interface PluginDetailModalProps {
  pluginName: string;
  onClose: () => void;
  onToggle: (name: string, currentEnabled: boolean) => void;
  isToggling: boolean;
}

function PluginDetailModal({ pluginName, onClose, onToggle, isToggling }: PluginDetailModalProps) {
  const { t } = useTranslation('settings');
  const { data, isLoading } = usePlugin(pluginName);
  const plugin = data?.plugin;

  const schema: Record<string, SchemaField> | null =
    plugin?.settings?.schema ?? null;
  const currentConfig: Record<string, any> = plugin?.userSettings ?? {};

  const title = plugin
    ? `${plugin.displayName} · v${plugin.version}`
    : pluginName;

  return (
    <Modal
      open
      title={title}
      description={plugin?.author}
      icon={<Puzzle className="h-4 w-4" />}
      onClose={onClose}
      size="md"
      footer={
        plugin ? (
          <Button
            type="button"
            variant={plugin.userEnabled ? 'danger' : 'success'}
            onClick={() => onToggle(pluginName, plugin.userEnabled ?? false)}
            isLoading={isToggling}
            leftIcon={plugin.userEnabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
            className="w-full sm:w-auto"
          >
            {plugin.userEnabled ? t('admin.plugins.disable') : t('admin.plugins.enable')}
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="space-y-3 py-2" aria-busy="true">
          <SkeletonItem className="h-4 w-full" />
          <SkeletonItem className="h-4 w-2/3" />
          <div className="flex gap-2 pt-2">
            <SkeletonItem className="h-5 w-24 rounded-full" />
            <SkeletonItem className="h-5 w-24 rounded-full" />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-gray-600 dark:text-gray-400">{plugin?.description}</p>

          <div className="flex flex-wrap gap-2">
            {plugin?.hasBackend && <Badge variant="blue" icon={<Check className="h-3 w-3" />}>{t('admin.plugins.backendApi')}</Badge>}
            {plugin?.hasFrontend && <Badge variant="brand" icon={<Check className="h-3 w-3" />}>{t('admin.plugins.frontendUi')}</Badge>}
            {plugin?.hasSettings && <Badge variant="green" icon={<Check className="h-3 w-3" />}>{t('admin.plugins.userSettings')}</Badge>}
          </div>

          {schema && Object.keys(schema).length > 0 && (
            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <h3 className="eyebrow mb-4">{t('admin.plugins.settings')}</h3>
              <PluginSettingsForm
                pluginName={pluginName}
                schema={schema}
                initialValues={currentConfig}
                onSaved={() => {}}
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const PluginsPage: React.FC = () => {
  const { t } = useTranslation('settings');
  const { data, isLoading, error } = usePlugins();
  const enablePlugin = useEnablePlugin();
  const disablePlugin = useDisablePlugin();
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null);
  const isToggling = enablePlugin.isPending || disablePlugin.isPending;

  const handleToggle = async (pluginName: string, currentEnabled: boolean) => {
    try {
      if (currentEnabled) {
        await disablePlugin.mutateAsync(pluginName);
      } else {
        await enablePlugin.mutateAsync(pluginName);
      }
    } catch (error) {
      console.error('Failed to toggle plugin:', error);
      toast.error(t('admin.plugins.toggleError'));
    }
  };

  const header = (
    <SettingsHeader title={t('admin.plugins.title')} description={t('admin.plugins.subtitle')} />
  );

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        {header}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonItem key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <SkeletonItem key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        {header}
        <Alert type="error" message={t('admin.plugins.loadError')} />
      </div>
    );
  }

  const plugins = data?.plugins || [];

  return (
    <div className="space-y-6">
      {header}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('admin.plugins.total')} value={data?.total ?? 0} icon={Package} variant="brand" />
        <StatCard label={t('admin.plugins.enabled')} value={data?.enabled ?? 0} icon={Power} variant="green" />
        <StatCard
          label={t('admin.plugins.disabled')}
          value={(data?.total ?? 0) - (data?.enabled ?? 0)}
          icon={PowerOff}
          variant="orange"
        />
      </div>

      {/* Plugin cards */}
      {plugins.length === 0 ? (
        <EmptyState
          bordered
          icon={Package}
          title={t('admin.plugins.empty')}
          description={t('admin.plugins.emptyHint')}
        />
      ) : (
        <div className="stagger grid grid-cols-1 gap-4 lg:grid-cols-2">
          {plugins.map((plugin) => (
            <div
              key={plugin.name}
              role="button"
              tabIndex={0}
              aria-label={t('admin.plugins.openDetails', { name: plugin.displayName })}
              className="surface surface-interactive group flex cursor-pointer flex-col p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              onClick={() => setSelectedPlugin(plugin.name)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedPlugin(plugin.name);
                }
              }}
            >
              <div className="mb-3 flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset transition-colors',
                      plugin.userEnabled
                        ? 'bg-brand-50 text-brand-600 ring-brand-600/10 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/20'
                        : 'bg-gray-50 text-gray-400 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-500 dark:ring-gray-800'
                    )}
                  >
                    <Puzzle className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-gray-900 dark:text-white">{plugin.displayName}</h3>
                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                      v{plugin.version} · {plugin.author}
                    </p>
                  </div>
                </div>
                <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <SettingsSwitch
                    checked={!!plugin.userEnabled}
                    onChange={() => handleToggle(plugin.name, plugin.userEnabled)}
                    label={plugin.userEnabled ? t('admin.plugins.disable') : t('admin.plugins.enable')}
                    disabled={isToggling}
                  />
                </div>
              </div>

              <p className="mb-4 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">{plugin.description}</p>

              <div className="mt-auto flex items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {plugin.hasBackend && <Badge variant="blue" size="sm">{t('admin.plugins.backend')}</Badge>}
                  {plugin.hasFrontend && <Badge variant="brand" size="sm">{t('admin.plugins.frontend')}</Badge>}
                  {plugin.hasSettings && <Badge variant="green" size="sm">{t('admin.plugins.settings')}</Badge>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={plugin.userEnabled ? 'green' : 'gray'} size="sm" dot>
                    {plugin.userEnabled ? t('admin.plugins.statusEnabled') : t('admin.plugins.statusDisabled')}
                  </Badge>
                  <ChevronRight
                    className="h-4 w-4 text-gray-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-gray-500 dark:text-gray-600 dark:group-hover:text-gray-400"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedPlugin && (
        <PluginDetailModal
          pluginName={selectedPlugin}
          onClose={() => setSelectedPlugin(null)}
          onToggle={async (name, enabled) => {
            await handleToggle(name, enabled);
          }}
          isToggling={isToggling}
        />
      )}
    </div>
  );
};

export default PluginsPage;
