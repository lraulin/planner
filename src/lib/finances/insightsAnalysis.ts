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
  externalTransferCentsOf,
  incomeCentsOf,
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
  spendCentsOf,
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
  /** Recurring-spend payee identities withheld from review and cadence proposals. */
  suppressPayeeIds?: readonly string[];
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
  /** The window's reconciliation, or null when no bucket has an official position. */
  reconciliation: Reconciliation | null;
};

/**
 * Does the money we recorded moving agree with the money the banks say moved?
 *
 *     netCents + externalTransferCents = statementCents + residualCents
 *
 * **Deliberately computed unlevelled**, even when the chart is levelling recurring bills.
 * Levelling spreads a bill across the periods it covers, which is a presentational
 * smoothing: it moves cost across bucket edges and therefore changes the window's visible
 * total, while the official position it is being compared against cannot move at all. On
 * real data that alone shifted net by $2,170 and turned a healthy reconciliation into a
 * fictitious residual. The question "did the books balance" is about money that actually
 * moved, so it is answered from the rows.
 */
export type Reconciliation = {
  netCents: number;
  externalCents: number;
  statementCents: number;
  /** What the identity leaves over: a hole, an unpaired leg, or a misclassified row. */
  residualCents: number;
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
        // The identity, not a subtraction of two things that were never comparable:
        // transaction net plus what crossed the boundary should be the change in official
        // position. What is left over is the part no imported row accounts for.
        residualCents:
          statementNetCents === null
            ? null
            : point.netCents + point.externalTransferCents - statementNetCents,
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

  // Measured over the **bucket** span rather than `range`, because that is the span the
  // statement positions bookend. `range` can stop mid-month (the last import), and pairing
  // a part-month of rows against a whole month of official movement invents a residual.
  const spanStart = buckets[0]?.startKey ?? range.startKey;
  const spanEnd = buckets[buckets.length - 1]?.endKey ?? range.endKey;
  const spanned = filtered.filter(
    (row) => row.transactionDate >= spanStart && row.transactionDate <= spanEnd,
  );
  const anchored = flow.filter((point) => point.statementNetCents !== null);
  const reconciliation: Reconciliation | null =
    anchored.length === 0
      ? null
      : (() => {
          const netCents = spanned.reduce(
            (total, row) => total + incomeCentsOf(row) - spendCentsOf(row),
            0,
          );
          const externalCents = spanned.reduce(
            (total, row) => total + externalTransferCentsOf(row),
            0,
          );
          const statementCents = anchored.reduce(
            (total, point) => total + (point.statementNetCents ?? 0),
            0,
          );
          return {
            netCents,
            externalCents,
            statementCents,
            residualCents: netCents + externalCents - statementCents,
          };
        })();

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
    suggestions: oneOffSuggestions(windowed, {
      bills,
      suppressPayeeIds: options.suppressPayeeIds,
    }),
    // Both of these read the **whole** filtered history, not the window. The two charges
    // that make a semi-annual pattern are eight months apart, and the anchor a forecast
    // walks from is the most recent charge — a window that hides either produces a
    // confident wrong answer rather than no answer.
    candidates: cadenceCandidates(filtered, {
      suppressPayeeIds: [
        ...bills.flatMap((bill) => bill.payeeIds ?? []),
        ...(options.suppressPayeeIds ?? []),
      ],
    }),
    upcoming: upcomingBills(filtered, bills, options.today ?? full.endKey),
    assetDebt,
    contributions: accountContributions(filtered, range),
    debtRatio: latest ? debtToAssetRatio(latest.assetCents, latest.debtCents) : null,
    latest,
    reconciliation,
  };
}
