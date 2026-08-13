import { asOneOf, asRecord } from "./parse";

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
export const INSIGHTS_WINDOWS = ["6m", "12m", "24m", "all"] as const;
export type InsightsWindow = (typeof INSIGHTS_WINDOWS)[number];

export const WINDOW_MONTHS: Record<InsightsWindow, number | null> = {
  "6m": 6,
  "12m": 12,
  "24m": 24,
  all: null,
};

export const WINDOW_LABELS: Record<InsightsWindow, string> = {
  "6m": "6 months",
  "12m": "12 months",
  "24m": "2 years",
  all: "All time",
};

/**
 * Whether the cash-flow chart shows the two sides or the difference between them.
 *
 * `in-out` answers "which is bigger"; `net` answers "did this period gain or lose", which
 * is a signed quantity and reads better as one bar either side of zero than as the gap
 * between two.
 */
export const INSIGHTS_CHART_MODES = ["in-out", "net"] as const;
export type InsightsChartMode = (typeof INSIGHTS_CHART_MODES)[number];

export const CHART_MODE_LABELS: Record<InsightsChartMode, string> = {
  "in-out": "In & out",
  net: "Net",
};

export type InsightsViewSettings = {
  axis: InsightsAxis;
  window: InsightsWindow;
  mode: InsightsChartMode;
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
};

export function parseInsightsView(value: unknown): InsightsViewSettings {
  const record = asRecord(value);
  if (!record) return DEFAULT_INSIGHTS_VIEW;
  return {
    axis: asOneOf(record.axis, INSIGHTS_AXES, DEFAULT_INSIGHTS_VIEW.axis),
    window: asOneOf(record.window, INSIGHTS_WINDOWS, DEFAULT_INSIGHTS_VIEW.window),
    mode: asOneOf(record.mode, INSIGHTS_CHART_MODES, DEFAULT_INSIGHTS_VIEW.mode),
  };
}

export function serializeInsightsView(value: InsightsViewSettings): unknown {
  return { axis: value.axis, window: value.window, mode: value.mode };
}
