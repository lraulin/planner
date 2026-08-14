/**
 * The Insights dashboard composition, as a pure function.
 *
 * `InsightsView` used to do this inside a `useMemo`. The agent tools need the same
 * numbers, and restating the sequence — filter, then window, cash-flow over the *full*
 * history then slice, detect recurring on the window but price declared bills from the
 * whole history — is how the agent and the page start disagreeing. One function, two
 * callers.
 *
 * Sankey layout, drill rows and the coverage gap stay out: the first two are
 * presentation, and coverage reads the *unfiltered* import rather than this slice.
 */

import { buildPayPeriods } from "@/lib/finances/classify/payPeriods";
import {
  accountContributions,
  assetDebtSeries,
  baselineSplit,
  cadenceCandidates,
  cashFlow,
  debtToAssetRatio,
  monthBuckets,
  monthlyIncome,
  oneOffSuggestions,
  paydaysFrom,
  payPeriodBuckets,
  recurringMerchants,
  rowsInRange,
  rowsRange,
  spendByCategory,
  spendByCategoryPerBucket,
  spendByMerchant,
  upcomingBills,
  type AnalyticsRow,
  type AssetDebtPoint,
  type BaselineSplit,
  type Bucket,
  type CadenceCandidate,
  type CashFlowPoint,
  type CategoryTotal,
  type DateRange,
  type IncomeBreakdown,
  type MerchantTotal,
  type OneOffSuggestion,
  type RecurringMerchant,
  type UpcomingBill,
} from "./analytics";
import {
  applyInsightsFilter,
  EMPTY_INSIGHTS_FILTER,
  resolveInsightsRange,
  type InsightsReportFilter,
  type InsightsWindowKey,
} from "./insightsFilter";
import type { DeclaredBill } from "./recurringBills";
import type { InsightsAxis } from "@/lib/settings/finances";
import { statementCashFlow, type PositionStatement } from "./statementCashFlow";

export type InsightsAnalysisOptions = {
  filter?: InsightsReportFilter;
  window?: InsightsWindowKey;
  axis?: InsightsAxis;
  levelRecurring?: boolean;
  /** Wall-clock day for YTD/QTD. Null falls back to the last imported day. */
  today?: string | null;
  /** Official bookends. Position still works with none (ledger through asOf). */
  statements?: readonly PositionStatement[];
  /**
   * When set, this range is the window. Trailing averages still run over the
   * full filtered history, the same way a named window does.
   */
  range?: DateRange;
};

export type InsightsAnalysisEmpty = {
  empty: true;
  filtered: AnalyticsRow[];
};

export type InsightsAnalysisReady = {
  empty: false;
  filtered: AnalyticsRow[];
  range: DateRange;
  windowed: AnalyticsRow[];
  buckets: Bucket[];
  flow: CashFlowPoint[];
  split: BaselineSplit;
  income: IncomeBreakdown;
  categories: CategoryTotal[];
  payees: MerchantTotal[];
  trends: ReturnType<typeof spendByCategoryPerBucket>;
  recurring: RecurringMerchant[];
  suggestions: OneOffSuggestion[];
  candidates: CadenceCandidate[];
  upcoming: UpcomingBill[];
  assetDebt: AssetDebtPoint[];
  contributions: ReturnType<typeof accountContributions>;
  debtRatio: number | null;
  latest: AssetDebtPoint | undefined;
};

export type InsightsAnalysis = InsightsAnalysisEmpty | InsightsAnalysisReady;

export function analyzeInsights(
  rows: readonly AnalyticsRow[],
  bills: readonly DeclaredBill[],
  options: InsightsAnalysisOptions = {},
): InsightsAnalysis {
  const filter = options.filter ?? EMPTY_INSIGHTS_FILTER;
  const window = options.window ?? "12m";
  const axis = options.axis ?? "month";
  const levelRecurring = options.levelRecurring ?? false;

  const filtered = applyInsightsFilter(rows, filter);
  const full = rowsRange(filtered);
  if (!full) return { filtered, empty: true };

  const range =
    options.range ?? resolveInsightsRange(window, options.today ?? full.endKey, full);
  if (!range) return { filtered, empty: true };
  const windowed = rowsInRange(filtered, range);

  const paydays = paydaysFrom(filtered);
  const buckets: Bucket[] =
    axis === "pay-period"
      ? payPeriodBuckets(buildPayPeriods(paydays, range))
      : monthBuckets(range);

  const fullBuckets: Bucket[] =
    axis === "pay-period"
      ? payPeriodBuckets(buildPayPeriods(paydays, full))
      : monthBuckets(full);
  const visibleKeys = new Set(buckets.map((bucket) => bucket.key));
  const statementPoints = statementCashFlow(
    options.statements ?? [],
    filtered,
    fullBuckets,
  );
  const statementByKey = new Map(statementPoints.map((point) => [point.key, point]));
  const flow = cashFlow(filtered, fullBuckets, {
    levelRecurring,
    bills,
  })
    .filter((point) => visibleKeys.has(point.bucket.key))
    .map((point) => {
      const statement = statementByKey.get(point.bucket.key);
      const statementNetCents = statement?.netCents ?? null;
      return {
        ...point,
        statementPositionCents: statement?.positionCents ?? null,
        statementNetCents,
        discrepancyCents:
          statementNetCents === null ? null : point.netCents - statementNetCents,
      };
    });

  const income = monthlyIncome(filtered, paydays, range);
  // Detection runs on the window; declared bills read their amounts from the whole
  // history, so a commitment does not vanish from the table when the window narrows.
  const recurring = recurringMerchants(windowed, bills, filtered);
  const split = baselineSplit(windowed, buckets.length, {
    levelRecurring,
    bills: recurring,
    buckets,
  });
  const trends = spendByCategoryPerBucket(windowed, buckets);
  const assetDebt = assetDebtSeries(filtered, buckets);
  const latest = assetDebt[assetDebt.length - 1];

  return {
    empty: false,
    filtered,
    range,
    windowed,
    buckets,
    flow,
    split,
    income,
    categories: spendByCategory(windowed),
    payees: spendByMerchant(windowed),
    trends,
    recurring,
    suggestions: oneOffSuggestions(windowed, { bills }),
    // Both of these read the **whole** filtered history, not the window. The two charges
    // that make a semi-annual pattern are eight months apart, and the anchor a forecast
    // walks from is the most recent charge — a window that hides either produces a
    // confident wrong answer rather than no answer.
    candidates: cadenceCandidates(filtered),
    upcoming: upcomingBills(filtered, bills, options.today ?? full.endKey),
    assetDebt,
    contributions: accountContributions(filtered, range),
    debtRatio: latest ? debtToAssetRatio(latest.assetCents, latest.debtCents) : null,
    latest,
  };
}
