import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../common/Badge';
import { useApiTokenCatalog } from '../../../hooks/api/useApiTokens';
import type { ApiTokenPermissions } from '../../../api/types';
import { grantedResources } from './apiTokenHelpers';
import { CAPABILITY_ICONS } from './capabilityIcons';

/** How many resource badges are shown before "+N more". */
const VISIBLE_RESOURCES = 3;

/**
 * What a token may do, at a glance: its features, then up to three data
 * areas with their level (amber for write, red for delete), the rest folded
 * into "+N more" with a tooltip.
 */
export const ApiTokenAccessBadges: FC<{ permissions: ApiTokenPermissions }> = ({ permissions }) => {
  const { t } = useTranslation('settings');
  const { data: catalog } = useApiTokenCatalog();
  const granted = grantedResources(permissions, catalog);
  const hidden = granted.slice(VISIBLE_RESOURCES);
  const label = (key: string, level: string) =>
    `${t(`admin.apiTokens.resources.${key}.label`)} · ${t(`admin.apiTokens.levels.${level}`)}`;

  return (
    <div className="flex max-w-sm flex-wrap gap-1">
      {permissions.capabilities.map((capability) => {
        const Icon = CAPABILITY_ICONS[capability];
        return (
          <Badge key={capability} variant="brand" size="sm" icon={<Icon className="h-3 w-3" />}>
            {t(`admin.apiTokens.capabilities.${capability}.label`)}
          </Badge>
        );
      })}
      {granted.slice(0, VISIBLE_RESOURCES).map(({ key, level }) => (
        <Badge key={key} variant={level === 'delete' ? 'red' : level === 'write' ? 'amber' : 'gray'} size="sm">
          {label(key, level)}
        </Badge>
      ))}
      {hidden.length > 0 && (
        <span title={hidden.map(({ key, level }) => label(key, level)).join('\n')}>
          <Badge variant="gray" size="sm">
            {t('admin.apiTokens.moreAccess', { count: hidden.length })}
          </Badge>
        </span>
      )}
      {granted.length === 0 && permissions.capabilities.length === 0 && (
        <span className="text-xs text-gray-400">{t('admin.apiTokens.noAccess')}</span>
      )}
    </div>
  );
};
