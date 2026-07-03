/**
 * AI Insights Controller — barrel.
 * Pre-aggregated query endpoints designed for LLM tool use, split by domain:
 *  - insights/time-insights.controller       (time summary, working pattern)
 *  - insights/financial-insights.controller  (revenue, expense, profit)
 *  - insights/overview-insights.controller   (client / project overviews)
 * Route registrations import from this barrel, so the split is transparent.
 */

export { getTimeSummary, getTimePattern } from './insights/time-insights.controller';
export { getRevenueSummary, getExpenseSummary, getProfitSummary } from './insights/financial-insights.controller';
export { getClientOverview, getProjectOverview } from './insights/overview-insights.controller';
