import { useTranslation } from 'react-i18next';
import { getDayKindForDate } from '../../../utils/holidays-api';
import { getDayBandColor, getDayTickStyle } from '../../../utils/chartConfig';
import { useChartTheme } from '../../../hooks/ui/useChartTheme';

const LEGEND_KINDS = ['weekend', 'national-holiday', 'regional-holiday'] as const;

/**
 * Explains how a chart's day axis marks weekends and holidays (background band,
 * marker after the label — see `dayBandsPlugin` / `getDayTickStyle`), only for the
 * kinds of day that occur in `dates`.
 */
export function DayMarkerLegend({ dates, region }: { dates: string[]; region?: string }) {
  const { t } = useTranslation('time-tracking');
  const theme = useChartTheme();
  const kinds = new Set(dates.map((date) => getDayKindForDate(date, 'DE', region)));
  const items = LEGEND_KINDS.filter((kind) => kinds.has(kind));
  if (items.length === 0) return null;

  const label = {
    weekend: t('charts.weekend'),
    'national-holiday': t('charts.holidayNational'),
    'regional-holiday': t('charts.holidayRegional'),
  };

  return (
    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
      {items.map((kind) => {
        const marker = getDayTickStyle(kind, theme).marker.trim();
        return (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <span
              className="inline-flex h-3 w-3 items-center justify-center rounded-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-700"
              style={{ backgroundColor: getDayBandColor(kind, theme) ?? undefined }}
              aria-hidden="true"
            />
            {marker && (
              <span className="font-bold" style={{ color: getDayTickStyle(kind, theme).color }} aria-hidden="true">
                {marker}
              </span>
            )}
            {label[kind]}
          </span>
        );
      })}
    </p>
  );
}
