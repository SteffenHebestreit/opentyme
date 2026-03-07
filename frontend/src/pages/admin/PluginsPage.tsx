/**
 * Plugins Management Page
 *
 * Admin page for viewing and managing installed plugins.
 * Shows a settings form (driven by the addon manifest schema) when a plugin
 * with `hasSettings = true` is selected.
 */

import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Alert } from '../../components/common/Alert';
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
  const [values, setValues] = useState<Record<string, any>>(() => {
    const defaults: Record<string, any> = {};
    Object.entries(schema).forEach(([key, field]) => {
      defaults[key] = initialValues[key] ?? field.default ?? '';
    });
    return defaults;
  });
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const updateSettings = useUpdatePluginSettings(pluginName);

  const handleSave = async () => {
    setSaveMsg(null);
    try {
      await updateSettings.mutateAsync(values);
      setSaveMsg({ ok: true, text: 'Settings saved.' });
      onSaved();
    } catch {
      setSaveMsg({ ok: false, text: 'Failed to save settings.' });
    }
  };

  const set = (key: string, value: any) => setValues((prev) => ({ ...prev, [key]: value }));

  const fieldEntries = Object.entries(schema);

  return (
    <div className="space-y-4 pt-2">
      {fieldEntries.map(([key, field]) => {
        const label = field.label || key;
        const value = values[key];

        if (field.type === 'boolean') {
          return (
            <label key={key} className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!value}
                onChange={(e) => set(key, e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
                {field.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{field.description}</p>
                )}
              </div>
            </label>
          );
        }

        if (field.type === 'number') {
          return (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
              <input
                type="number"
                value={value ?? ''}
                step="any"
                onChange={(e) => set(key, parseFloat(e.target.value))}
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100"
              />
              {field.description && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.description}</p>}
            </div>
          );
        }

        // string — select if enum, password if secret, else text
        if (field.enum?.length) {
          return (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
              <select
                value={value ?? ''}
                onChange={(e) => set(key, e.target.value)}
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100"
              >
                {field.enum.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
              {field.description && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.description}</p>}
            </div>
          );
        }

        return (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
            <input
              type={field.secret ? 'password' : 'text'}
              value={value ?? ''}
              onChange={(e) => set(key, e.target.value)}
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 font-mono"
            />
            {field.description && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.description}</p>}
          </div>
        );
      })}

      <div className="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          isLoading={updateSettings.isPending}
        >
          Save Settings
        </Button>
        {saveMsg && (
          <Alert type={saveMsg.ok ? 'success' : 'error'} message={saveMsg.text} />
        )}
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
      onClose={onClose}
      size="md"
      footer={
        plugin ? (
          <Button
            variant={plugin.userEnabled ? 'danger' : 'success'}
            onClick={() => onToggle(pluginName, plugin.userEnabled ?? false)}
            disabled={isToggling}
            className="w-full"
          >
            {plugin.userEnabled ? 'Disable Plugin' : 'Enable Plugin'}
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="py-8 text-center text-sm text-gray-500">Loading…</div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-gray-600 dark:text-gray-400">{plugin?.description}</p>

          <div className="flex flex-wrap gap-2">
            {plugin?.hasBackend && <Badge variant="blue">✓ Backend API</Badge>}
            {plugin?.hasFrontend && <Badge variant="purple">✓ Frontend UI</Badge>}
            {plugin?.hasSettings && <Badge variant="green">✓ User Settings</Badge>}
          </div>

          {schema && Object.keys(schema).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 border-b border-gray-200 dark:border-gray-700 pb-1">
                Settings
              </h3>
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
  const { data, isLoading, error } = usePlugins();
  const enablePlugin = useEnablePlugin();
  const disablePlugin = useDisablePlugin();
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null);

  const handleToggle = async (pluginName: string, currentEnabled: boolean) => {
    try {
      if (currentEnabled) {
        await disablePlugin.mutateAsync(pluginName);
      } else {
        await enablePlugin.mutateAsync(pluginName);
      }
    } catch (error) {
      console.error('Failed to toggle plugin:', error);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Loading plugins…</div>;
  }

  if (error) {
    return (
      <Alert type="error" message="Failed to load plugins" />
    );
  }

  const plugins = data?.plugins || [];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">Addons</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Manage installed addons. Click an addon to view details and configure its settings.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total', value: data?.total ?? 0, color: 'text-gray-900 dark:text-white' },
          { label: 'Enabled', value: data?.enabled ?? 0, color: 'text-green-600 dark:text-green-400' },
          { label: 'Disabled', value: (data?.total ?? 0) - (data?.enabled ?? 0), color: 'text-gray-400' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Plugin cards */}
      {plugins.length === 0 ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="text-4xl mb-3">📦</div>
          <p className="text-gray-600 dark:text-gray-400">No addons installed.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {plugins.map((plugin) => (
            <div
              key={plugin.name}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
              onClick={() => setSelectedPlugin(plugin.name)}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{plugin.displayName}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">v{plugin.version} · {plugin.author}</p>
                </div>
                <label
                  className="relative inline-flex items-center cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={plugin.userEnabled}
                    onChange={() => handleToggle(plugin.name, plugin.userEnabled)}
                    className="sr-only peer"
                    disabled={enablePlugin.isPending || disablePlugin.isPending}
                  />
                  <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:bg-purple-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                </label>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">{plugin.description}</p>

              <div className="flex items-center justify-between">
                <div className="flex gap-1.5 flex-wrap">
                  {plugin.hasBackend && <Badge variant="blue" size="sm">Backend</Badge>}
                  {plugin.hasFrontend && <Badge variant="purple" size="sm">Frontend</Badge>}
                  {plugin.hasSettings && <Badge variant="green" size="sm">Settings</Badge>}
                </div>
                <Badge variant={plugin.userEnabled ? 'green' : 'gray'} size="sm" dot>
                  {plugin.userEnabled ? 'Enabled' : 'Disabled'}
                </Badge>
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
          isToggling={enablePlugin.isPending || disablePlugin.isPending}
        />
      )}
    </div>
  );
};

export default PluginsPage;
