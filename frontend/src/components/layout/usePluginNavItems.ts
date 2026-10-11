import { useMemo } from 'react';
import { frontendPluginRegistry } from '../../plugins/plugin-registry';
import { usePlugins } from '../../api/hooks/usePlugins';

/** Addon routes that declare a menu item, filtered to addons the user enabled. */
export function usePluginNavItems() {
  const { data: pluginsData } = usePlugins();

  // While loading (null) show nothing to avoid a flash; once resolved keep userEnabled ones.
  const userEnabledSet = useMemo(() => {
    if (!pluginsData?.plugins) return null;
    return new Set(pluginsData.plugins.filter((p) => p.userEnabled).map((p) => p.name));
  }, [pluginsData]);

  return frontendPluginRegistry
    .getAllRoutes()
    .filter((r) => r.menuItem)
    .filter((r) => !userEnabledSet || (r.pluginName ? userEnabledSet.has(r.pluginName) : true))
    .sort((a, b) => (a.menuItem!.order ?? 99) - (b.menuItem!.order ?? 99));
}
