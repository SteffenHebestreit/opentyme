import { useTranslation } from 'react-i18next';
import { getDayKindForDate } from '../../../utils/holidays-api';
import { getDayTickStyle } from '../../../utils/chartConfig';
import { useChartTheme } from '../../../hooks/ui/useChartTheme';

/**
 * Explains the holiday markers on a chart's day axis (see `getDayTickStyle`) —
 * only for the kinds of holiday that occur in `dates`.
 */
export function DayMarkerLegend({ dates, region }: { dates: string[]; region?: string }) {
  const { t } = useTranslation('time-tracking');
  const theme = useChartTheme();
  const kinds = new Set(dates.map((date) => getDayKindForDate(date, 'DE', region)));
  const items = (['national-holiday', 'regional-holiday'] as const).filter((kind) => kinds.has(kind));
  if (items.length === 0) return null;

  return (
    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
      {items.map((kind) => {
        const style = getDayTickStyle(kind, theme);
        return (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <span className="font-bold" style={{ color: style.color }} aria-hidden="true">
              {style.marker.trim()}
            </span>
            {kind === 'national-holiday' ? t('charts.holidayNational') : t('charts.holidayRegional')}
          </span>
        );
      })}
    </p>
  );
}
