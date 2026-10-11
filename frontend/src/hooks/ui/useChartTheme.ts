import { useApp } from '../../store/AppContext';
import type { ChartTheme } from '../../utils/chartConfig';

/**
 * The theme charts should be drawn in. Pass it to the chartConfig option
 * builders and include it in `useMemo` deps so charts restyle on theme switch.
 */
export function useChartTheme(): ChartTheme {
  return useApp().state.theme;
}
