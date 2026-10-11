import { useMemo } from 'react';
import { useApp } from '../../store/AppContext';
import { getChartPalette, getStatusChartColors } from '../../utils/chartConfig';
import type { ChartTheme } from '../../utils/chartConfig';

/**
 * The theme charts should be drawn in. Pass it to the chartConfig option
 * builders and include it in `useMemo` deps so charts restyle on theme switch.
 */
export function useChartTheme(): ChartTheme {
  return useApp().state.theme;
}

/**
 * Theme, categorical palette and status colours for charts — follows both the
 * light/dark theme and the colour-vision setting. Include the result in `useMemo`
 * deps so charts recolour when either changes.
 */
export function useChartColors() {
  const { theme, colorVision } = useApp().state;
  return useMemo(
    () => ({
      theme,
      vision: colorVision,
      palette: getChartPalette(theme),
      status: getStatusChartColors(theme, colorVision),
    }),
    [theme, colorVision]
  );
}
