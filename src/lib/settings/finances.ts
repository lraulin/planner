import {
  INSIGHTS_WINDOW_KEYS,
  parseInsightsDrill,
  serializeInsightsDrill,
  type InsightsDrill,
  type InsightsReportFilter,
  type InsightsWindowKey,
} from "@/lib/finances/insightsFilter";
import { asBoolean, asOneOf, asRecord, asStringArray } from "./parse";

/**
 * What the Insights dashboard remembers: how far back it looks, and which axis it buckets on.
 *
 * Both persist rather than sitting in component state for the same reason the grid's column
 * layout does — a window you have to re-pick on every visit is one you stop using. The axis
 * especially: someone who thinks in pay periods thinks in them every time.
 *
 * Stored under `insights`.
 */

/**
 * Calendar months, or one bucket per paycheck.
 *
 * Both exist because neither is right on its own. Months keep bills, statements and tax years
 * aligned; pay periods are the only way to compare two stretches of a biweekly year without a
 * three-paycheck month looking like a windfall.
 */
export const INSIGHTS_AXES = ["month", "pay-period"] as const;
export type InsightsAxis = (typeof INSIGHTS_AXES)[number];

/** `all` is the whole imported history — three years and counting. */
export const INSIGHTS_WINDOWS = INSIGHTS_WINDOW_KEYS;
export type InsightsWindow = InsightsWindowKey;

export const WINDOW_LABELS: Record<InsightsWindow, string> = {
  "3m": "3 months",
  "6m": "6 months",
  "12m": "12 months",
  "24m": "2 years",
  ytd: "YTD",
  qtd: "QTD",
  all: "All time",
};

/**
 * Whether the cash-flow chart shows the two sides or the difference between them.
 *
 * `in-out` answers "which is bigger"; `net` answers "did this period gain or lose", which
 * is a signed quantity and reads better as one bar either side of zero than as the gap
 * between two.
 */
export const INSIGHTS_CHART_MODES = ["in-out", "net", "fixed-variable"] as const;
export type InsightsChartMode = (typeof INSIGHTS_CHART_MODES)[number];

export const CHART_MODE_LABELS: Record<InsightsChartMode, string> = {
  "in-out": "In & out",
  net: "Net",
  "fixed-variable": "Bills vs rest",
};

export type InsightsViewSettings = {
  axis: InsightsAxis;
  window: InsightsWindow;
  mode: InsightsChartMode;
  /**
   * Spread recurring bills across the periods they cover.
   *
   * Off by default: it moves cost between buckets, so a levelled bar is a model of an
   * ongoing obligation rather than a record of that fortnight. Worth switching on precisely
   * when a monthly bill lands in a fortnightly bucket and swamps it.
   */
  levelRecurring: boolean;
  /**
   * Empty arrays mean *all* — unlike the checkbox convention in `parse.ts`. A dashboard
   * that silently shows nothing is a worse default than one that shows everything.
   */
  accounts: string[];
  categories: string[];
  merchants: string[];
  drill: InsightsDrill | null;
  /** Stacked vs grouped for the spending-trends panel. */
  trendMode: "stacked" | "grouped";
  sankeyGrouping: "category" | "category-merchant";
};

/**
 * Twelve months of calendar buckets. A year is the shortest window in which an annual
 * premium, a heating season and Christmas each appear exactly once, so it is the shortest
 * window whose averages are not an argument about which months got picked.
 */
export const DEFAULT_INSIGHTS_VIEW: InsightsViewSettings = {
  axis: "month",
  window: "12m",
  // In-and-out first: it is the view that shows *why* a net figure is what it is.
  mode: "in-out",
  levelRecurring: false,
  accounts: [],
  categories: [],
  merchants: [],
  drill: null,
  trendMode: "stacked",
  sankeyGrouping: "category",
};

const TREND_MODES = ["stacked", "grouped"] as const;
const SANKEY_GROUPINGS = ["category", "category-merchant"] as const;

export function parseInsightsView(value: unknown): InsightsViewSettings {
  const record = asRecord(value);
  if (!record) return DEFAULT_INSIGHTS_VIEW;
  return {
    axis: asOneOf(record.axis, INSIGHTS_AXES, DEFAULT_INSIGHTS_VIEW.axis),
    window: asOneOf(record.window, INSIGHTS_WINDOWS, DEFAULT_INSIGHTS_VIEW.window),
    mode: asOneOf(record.mode, INSIGHTS_CHART_MODES, DEFAULT_INSIGHTS_VIEW.mode),
    levelRecurring: asBoolean(
      record.levelRecurring,
      DEFAULT_INSIGHTS_VIEW.levelRecurring,
    ),
    accounts: asStringArray(record.accounts, DEFAULT_INSIGHTS_VIEW.accounts),
    categories: asStringArray(record.categories, DEFAULT_INSIGHTS_VIEW.categories),
    merchants: asStringArray(record.merchants, DEFAULT_INSIGHTS_VIEW.merchants),
    drill: parseInsightsDrill(record.drill),
    trendMode: asOneOf(record.trendMode, TREND_MODES, DEFAULT_INSIGHTS_VIEW.trendMode),
    sankeyGrouping: asOneOf(
      record.sankeyGrouping,
      SANKEY_GROUPINGS,
      DEFAULT_INSIGHTS_VIEW.sankeyGrouping,
    ),
  };
}

export function serializeInsightsView(value: InsightsViewSettings): unknown {
  return {
    axis: value.axis,
    window: value.window,
    mode: value.mode,
    levelRecurring: value.levelRecurring,
    accounts: value.accounts,
    categories: value.categories,
    merchants: value.merchants,
    drill: serializeInsightsDrill(value.drill),
    trendMode: value.trendMode,
    sankeyGrouping: value.sankeyGrouping,
  };
}

export function insightsFilterOf(view: InsightsViewSettings): InsightsReportFilter {
  return {
    accountIds: view.accounts,
    categories: view.categories,
    merchants: view.merchants,
  };
}
