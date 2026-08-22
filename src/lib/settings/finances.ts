import {
  INSIGHTS_WINDOW_KEYS,
  parseInsightsDrill,
  serializeInsightsDrill,
  type InsightsDrill,
  type InsightsReportFilter,
  type InsightsWindowKey,
} from "@/lib/finances/insightsFilter";
import {
  asBoolean,
  asFiniteNumber,
  asOneOf,
  asRecord,
  asString,
  asStringArray,
} from "./parse";

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

/**
 * A correction to the pay cadence the dashboard detected.
 *
 * Detection (`classify/income.ts`) reads a biweekly series out of the register and is right
 * almost always — it survived two employer changes, because it matches on cadence rather than
 * on the employer's name. It is still retrospective: after a job change, or while a sync runs a
 * few days behind, it is confidently wrong about the one number the whole page divides by.
 *
 * Both fields or neither. An anchor with no cadence is not a schedule, and defaulting the
 * cadence to a fortnight would silently invent the half of the answer the user did not give.
 */
export type PaydaySettings = {
  /** A `YYYY-MM-DD` that was, or will be, a payday. Null falls back to detection. */
  anchorDate: string | null;
  /** Days between paydays. Null falls back to detection. */
  cadenceDays: number | null;
};

export const DEFAULT_PAYDAY: PaydaySettings = { anchorDate: null, cadenceDays: null };

/** Guards the walk in `nextPayday` against a cadence that would loop or never advance. */
const MIN_CADENCE_DAYS = 1;
const MAX_CADENCE_DAYS = 366;

export function parsePayday(value: unknown): PaydaySettings {
  const record = asRecord(value);
  if (!record) return DEFAULT_PAYDAY;

  const anchor = asString(record.anchorDate, "");
  const cadence = asFiniteNumber(record.cadenceDays, 0);

  return {
    // A key that is not a calendar day is not a correction, it is a typo, and honouring it
    // would move the day count somewhere nobody chose.
    anchorDate: /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? anchor : null,
    cadenceDays:
      Number.isInteger(cadence) &&
      cadence >= MIN_CADENCE_DAYS &&
      cadence <= MAX_CADENCE_DAYS
        ? cadence
        : null,
  };
}

export function serializePayday(value: PaydaySettings): unknown {
  return { anchorDate: value.anchorDate, cadenceDays: value.cadenceDays };
}

export function insightsFilterOf(view: InsightsViewSettings): InsightsReportFilter {
  return {
    accountIds: view.accounts,
    categories: view.categories,
    merchants: view.merchants,
  };
}

/**
 * Where the envelope budget starts, and what was in the pot when it did.
 *
 * The budget deliberately does not reconstruct three years of assignments it never made
 * (`agent-os/specs/2026-08-22-1948-zero-based-budget/` D2). Instead the fold seeds
 * "funds from last month" at `startMonth` with `openingCents` and treats every earlier month as
 * absent — which is the same thing Actual does when you create an account with a starting
 * balance, and the reason a fresh start is the recommended way in.
 *
 * **`openingCents` is a recorded fact, not a live query.** It is the on-budget position on the
 * day before `startMonth` began, computed once at setup. Recomputing it on every load would
 * make the budget's history move whenever an old statement was imported or a transaction
 * recategorised, and "why did last month's Ready to Assign change" is exactly the question a
 * ledger exists to prevent. It can go negative: card balances are on-budget, and starting in
 * the hole is honest.
 *
 * Null `startMonth` means the budget has not been set up. That is the empty state, and it is
 * the only thing that distinguishes "no budget" from "a budget with nothing assigned".
 *
 * Stored under `budget`.
 */
export type BudgetSettings = {
  /** First calendar day of the first budgeted month (`YYYY-MM-01`). Null until setup runs. */
  startMonth: string | null;
  /** On-budget position the day before `startMonth`. Signed; negative is possible. */
  openingCents: number;
};

export const DEFAULT_BUDGET: BudgetSettings = { startMonth: null, openingCents: 0 };

export function parseBudget(value: unknown): BudgetSettings {
  const record = asRecord(value);
  if (!record) return DEFAULT_BUDGET;

  const start = asString(record.startMonth, "");
  const opening = asFiniteNumber(record.openingCents, 0);

  return {
    // Anything but the first of a month is not a month key, and honouring it would make the
    // fold's month arithmetic disagree with the stored allocations' `month`.
    startMonth: /^\d{4}-\d{2}-01$/.test(start) ? start : null,
    // Cents are integers everywhere in this module; a fraction here would silently poison
    // every balance downstream of the opening figure.
    openingCents: Number.isInteger(opening) ? opening : 0,
  };
}

export function serializeBudget(value: BudgetSettings): unknown {
  return { startMonth: value.startMonth, openingCents: value.openingCents };
}
