/**
 * Turning classified transactions into the figures the dashboard reports.
 *
 * Two distortions shape every function here, and both were the reason for the feature:
 *
 * - **Biweekly pay makes calendar months lie.** 26 paychecks over 12 months means some
 *   months hold three and look wildly positive while the next looks broke. That is a
 *   bucketing artifact, so the bucket is a parameter — `monthBuckets` and
 *   `payPeriodBuckets` are interchangeable and everything downstream takes whichever.
 * - **Averaging lies in the other direction.** A $20k wedding is real money that says
 *   nothing about what next month costs. So baseline and one-off spend are always two
 *   numbers here; nothing in this file ever blends them into one average.
 *
 * **Sign convention.** Stored amounts follow the module rule — positive is money into the
 * account. Spending is reported here as a **positive magnitude**, because every figure it
 * feeds is a cost ("groceries: $412"), and a chart of negative bars pointing down is a
 * worse answer to "what does life cost" than one pointing up. Income stays positive too.
 * `netCents` is `income − spend` and is the only figure allowed to be negative.
 *
 * Everything is integer cents and pure. Totals over the whole register are computed in SQL
 * (`queries.ts`); these run over a window already loaded for the page, where exact integer
 * arithmetic in JS is both correct and cheaper than a round trip per panel.
 */

import type { FinanceAccountKind, FinanceFlowKind } from "@/db/schema";
import { daysBetweenKeys, shiftDateKey } from "@/lib/schedule/geometry";
import { categoryFromBank, UNCATEGORIZED } from "./classify/categories";
import { detectIncome, normalizedMonthlyIncome, type Payday } from "./classify/income";
import { normalizeMerchant } from "./classify/merchant";
import type { PayPeriod } from "./classify/payPeriods";
import { matchRule } from "./classify/rules";
import {
  dateFallsInHole,
  reconcileAccounts,
  type CoverageHole,
  type ReconcileStatement,
} from "./reconcile";
import {
  annualCents as annualFromCharge,
  cadenceMonthsFromGapDays,
  type DeclaredBill,
  nextDueFrom,
  spanDays,
} from "./recurringBills";

/** One classified transaction, as every panel reads it. */
export type AnalyticsRow = {
  id: string;
  accountId: string;
  accountName: string;
  /** Drives assets-vs-debt. The classifier never writes this. */
  accountKind: FinanceAccountKind;
  /** `YYYY-MM-DD`. */
  transactionDate: string;
  description: string;
  /** Signed; positive is money into the account. */
  amountCents: number;
  sourceCategory: string;
  /** The user's category. Wins over everything below it. */
  category: string | null;
  derivedCategory: string | null;
  derivedFlow: FinanceFlowKind | null;
  flowOverride: FinanceFlowKind | null;
  /** Set when the classifier found this movement's other leg. Null means it never did. */
  transferGroupId: string | null;
  excludeFromBaseline: boolean;
  eventLabel: string;
};

/**
 * The three fields that decide a flow. Structural rather than `AnalyticsRow` so the register
 * can resolve the same value from its own row type — one implementation of the rule, which
 * is the whole point of it being a rule.
 */
export type FlowFields = {
  flowOverride: FinanceFlowKind | null;
  derivedFlow: FinanceFlowKind | null;
  amountCents: number;
};

/** The fields that decide a category, on the same terms as {@link FlowFields}. */
export type CategoryFields = {
  category: string | null;
  derivedCategory: string | null;
  sourceCategory: string;
};

/**
 * The flow to report this row as.
 *
 * The fallback is not dead code: a row imported since the last reclassify has no derived
 * flow at all, and a dashboard that silently dropped it would under-report spending without
 * saying so.
 */
export function effectiveFlow(row: FlowFields): FinanceFlowKind {
  return (
    row.flowOverride ?? row.derivedFlow ?? (row.amountCents > 0 ? "refund" : "spend")
  );
}

/**
 * The category to report this row under, in the order the founding spec's column split
 * implies: the user's own, then the classifier's, then the bank's vocabulary mapped onto
 * our taxonomy, then an honest admission.
 */
export function effectiveCategory(row: CategoryFields): string {
  const own = row.category?.trim();
  if (own) return own;
  if (row.derivedCategory) return row.derivedCategory;
  return categoryFromBank(row.sourceCategory) ?? UNCATEGORIZED;
}

/** Merchant identity for grouping — a rule's canonical name when one claimed the row. */
export function effectiveMerchant(row: { description: string }): string {
  const normalized = normalizeMerchant(row.description);
  return matchRule(normalized)?.merchant ?? normalized;
}

/** Flows that are money leaving for good. Transfers are movement, not cost. */
const SPENDING_FLOWS: readonly FinanceFlowKind[] = ["spend", "interest_fee", "refund"];

export function isSpending(flow: FinanceFlowKind): boolean {
  return SPENDING_FLOWS.includes(flow);
}

/**
 * A row's contribution to reported spend, as a positive cost.
 *
 * A refund is a negative cost, which is why it is in `SPENDING_FLOWS` rather than dropped:
 * returning the couch has to reduce what the couch cost.
 *
 * **`interest_fee` is the one flow that runs both ways.** It covers the cost of holding the
 * accounts *and* the interest a savings account pays you, and the schema deliberately keeps
 * them under one kind. Only the charge is a cost: counting the credit as negative spending
 * made a quiet fortnight in 2023 report −$117 of outgoings, because $117 of savings interest
 * was the only thing in it.
 */
export function spendCentsOf(row: FlowFields): number {
  const flow = effectiveFlow(row);
  if (!isSpending(flow)) return 0;
  if (flow === "interest_fee" && row.amountCents > 0) return 0;
  return -row.amountCents;
}

/** Money arriving: a paycheck, or the other half of `interest_fee` — interest earned. */
export function incomeCentsOf(row: FlowFields): number {
  const flow = effectiveFlow(row);
  if (flow === "income") return row.amountCents;
  if (flow === "interest_fee" && row.amountCents > 0) return row.amountCents;
  return 0;
}

/**
 * Money crossing the boundary of what this module can see, **signed** — positive arriving,
 * negative leaving.
 *
 * This is the third term, and it is neither income nor spending. A tax refund, an HSA
 * reimbursement, a crypto liquidation and a gift from a parent all fund a month without
 * being earnings; a sweep out to an unimported credit union leaves without being a cost.
 *
 * It gets its own accessor because leaving it out of both other accessors is what made
 * `netCents` disagree with the statement-anchored series by $15,462 over two years — money
 * that demonstrably moved the household position while appearing in no reported total. The
 * fix is not to fold it into income: that would make a Coinbase sale and a paycheck the same
 * thing. The fix is to report it, so
 *
 *     statement net = netCents + externalTransferCents + residual
 *
 * and the residual is small enough to mean something when it is not.
 */
export function externalTransferCentsOf(row: FlowFields): number {
  return effectiveFlow(row) === "external_transfer" ? row.amountCents : 0;
}

// — Buckets ——————————————————————————————————————————————————————————————————

/** One time window on the x-axis. Calendar months and pay periods are the same shape. */
export type Bucket = {
  /** Sortable identity — `2026-03` or the period's start day. */
  key: string;
  label: string;
  /** Inclusive `YYYY-MM-DD`. */
  startKey: string;
  /** Inclusive `YYYY-MM-DD`. */
  endKey: string;
};

export type DateRange = { startKey: string; endKey: string };

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** `2026-03-14` → `2026-03`. String slicing, because these are calendar labels. */
export function monthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** `2026-03` → `Mar 2026`. */
export function monthLabel(key: string): string {
  const month = Number(key.slice(5, 7));
  return `${MONTH_ABBREVIATIONS[month - 1] ?? key.slice(5, 7)} ${key.slice(0, 4)}`;
}

function lastDayOfMonth(key: string): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  // Day 0 of the next month is the last day of this one, and `Date.UTC` handles the
  // year rollover and February without a table.
  const end = new Date(Date.UTC(year, month, 0));
  return end.toISOString().slice(0, 10);
}

function nextMonthKey(key: string): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, "0")}`;
}

function previousMonthKey(key: string): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, "0")}`;
}

/** Every calendar month touching `range`, oldest first. Contiguous, gaps included. */
export function monthBuckets(range: DateRange): Bucket[] {
  if (range.startKey > range.endKey) return [];
  const buckets: Bucket[] = [];
  let key = monthKey(range.startKey);
  const last = monthKey(range.endKey);
  while (key <= last) {
    buckets.push({
      key,
      label: monthLabel(key),
      startKey: `${key}-01`,
      endKey: lastDayOfMonth(key),
    });
    key = nextMonthKey(key);
  }
  return buckets;
}

/**
 * The paydays that define a pay-period axis.
 *
 * **Not every income row is a payday.** A pay period is one paycheck's worth of time, so it
 * is defined by a *cadence*, not by money arriving. A monthly VA benefit is reliable income
 * and belongs in every income figure on the page — but letting it open a period split the
 * biweekly calendar into extra windows whose only income was $180, which is how 31 of 104
 * "paydays" came to be a disability payment.
 *
 * So this runs the same `detectIncome` the classifier does rather than grouping income rows
 * by hand. Its biweekly test (a median gap of 12–16 days) is what excludes a ~30-day series,
 * and having one implementation of that rule is what stops the dashboard and the classifier
 * disagreeing about what a paycheck is.
 */
export function paydaysFrom(rows: readonly AnalyticsRow[]): Payday[] {
  const income = rows
    .filter((row) => effectiveFlow(row) === "income")
    .map((row) => ({
      id: row.id,
      transactionDate: row.transactionDate,
      description: row.description,
      amountCents: row.amountCents,
    }));
  return detectIncome(income).paydays;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export type IncomeBreakdown = {
  /** `median(paycheck) × 26 ÷ 12`. */
  paycheckMonthlyCents: number;
  /** Reliable income that is not a paycheck, averaged over the window's months. */
  otherMonthlyCents: number;
  totalMonthlyCents: number;
  medianPaycheckCents: number;
  paydayCount: number;
};

/**
 * What arrives in a typical month, paycheck and otherwise.
 *
 * Reported as two parts because they are known two different ways: the paycheck half is a
 * median times a cadence, which is stable against a three-paycheck month; the other half is
 * whatever else the classifier calls income — a monthly benefit, interest earned — averaged
 * over the window. Adding them is right (it is all money arriving) but blending how they
 * were derived would hide that the second half is an average and the first is not.
 */
export function monthlyIncome(
  rows: readonly AnalyticsRow[],
  paydays: readonly Payday[],
  range: DateRange,
): IncomeBreakdown {
  const inWindow = paydays.filter(
    (payday) => payday.dateKey >= range.startKey && payday.dateKey <= range.endKey,
  );
  const medianPaycheckCents = median(inWindow.map((payday) => payday.amountCents));
  const paycheckMonthlyCents = normalizedMonthlyIncome(medianPaycheckCents);

  const onAPayday = new Set(inWindow.flatMap((payday) => payday.transactionIds));
  const otherCents = rowsInRange(rows, range)
    .filter((row) => !onAPayday.has(row.id))
    .reduce((total, row) => total + incomeCentsOf(row), 0);
  const months = Math.max(1, monthBuckets(range).length);

  return {
    paycheckMonthlyCents,
    otherMonthlyCents: Math.round(otherCents / months),
    totalMonthlyCents: paycheckMonthlyCents + Math.round(otherCents / months),
    medianPaycheckCents,
    paydayCount: inWindow.length,
  };
}

/**
 * One bucket per paycheck window.
 *
 * The label is the start day rather than a month name on purpose: two windows inside one
 * month would otherwise carry the same label, which is exactly the confusion this axis
 * exists to remove.
 */
export function payPeriodBuckets(periods: readonly PayPeriod[]): Bucket[] {
  return periods.map((period) => ({
    key: period.startKey,
    label: `${MONTH_ABBREVIATIONS[Number(period.startKey.slice(5, 7)) - 1]} ${Number(
      period.startKey.slice(8, 10),
    )}`,
    startKey: period.startKey,
    endKey: period.endKey,
  }));
}

/**
 * Rows grouped into buckets, keyed by `Bucket.key`.
 *
 * Buckets are contiguous and sorted, so this walks both lists once rather than scanning
 * every bucket per row — three years of pay periods against three thousand rows is enough
 * for the quadratic version to be felt on a phone.
 */
export function bucketRows(
  rows: readonly AnalyticsRow[],
  buckets: readonly Bucket[],
): Map<string, AnalyticsRow[]> {
  const grouped = new Map<string, AnalyticsRow[]>(
    buckets.map((bucket) => [bucket.key, []]),
  );
  if (buckets.length === 0) return grouped;

  const ordered = [...rows].sort((left, right) =>
    left.transactionDate.localeCompare(right.transactionDate),
  );
  let index = 0;
  for (const row of ordered) {
    while (index < buckets.length && buckets[index].endKey < row.transactionDate) {
      index += 1;
    }
    if (index >= buckets.length) break;
    // Before the first bucket, or inside a gap the calendar does not cover.
    if (row.transactionDate < buckets[index].startKey) continue;
    grouped.get(buckets[index].key)?.push(row);
  }
  return grouped;
}

// — Cash flow ————————————————————————————————————————————————————————————————

export type CashFlowPoint = {
  bucket: Bucket;
  incomeCents: number;
  /** Positive cost. `fixedCents + variableCents`. */
  spendCents: number;
  /** The part of the cost that is a recurring bill — rent, insurance, subscriptions. */
  fixedCents: number;
  /** Everything else. The half that is actually a decision each period. */
  variableCents: number;
  /** `income − spend`. The only figure here that may be negative. */
  netCents: number;
  /**
   * Signed external transfers in this bucket — positive arriving, negative leaving.
   *
   * Deliberately outside `netCents`: it funds a month without being earned. Reported so the
   * gap between transaction net and statement net has a name instead of looking like a bug.
   */
  externalTransferCents: number;
  /** Trailing average of `spendCents`, or null until the window is full. */
  trailingSpendCents: number | null;
  /** Trailing average of `incomeCents`, or null until the window is full. */
  trailingIncomeCents: number | null;
  /**
   * Trailing average of `netCents`, or null until the window is full.
   *
   * Its own average rather than `trailingIncome − trailingSpend`: those two are equal here,
   * but only because both windows are the same length, and a reader should not have to
   * verify that to trust the line.
   */
  trailingNetCents: number | null;
  /** Official household position at this bucket's end. Null when not computed. */
  statementPositionCents?: number | null;
  /** Change in that position from the previous bucket. */
  statementNetCents?: number | null;
  /**
   * What the identity fails to explain:
   * `netCents + externalTransferCents − statementNetCents`. Null when statement net is
   * missing.
   *
   * Near zero is the healthy case. A residual is a hole in the imported history, an unpaired
   * transfer leg, or a misclassified row — the things that genuinely need looking at. It
   * replaced a plain `netCents − statementNetCents`, which was dominated by external
   * transfers and so stayed large for a perfectly healthy dataset.
   */
  residualCents?: number | null;
};

/**
 * How many buckets the rolling average looks back over. Twelve months is a year of
 * seasonality — heating, insurance, Christmas — which is the shortest window that stops
 * December from looking like a trend.
 */
export const TRAILING_WINDOW = 12;

/**
 * Mean of the `window` values ending at each index, or null where there are not yet that
 * many. Null rather than a partial average: a "trailing 12" computed from three months is a
 * different statistic wearing the same label, and it is always the flattering one.
 */
export function trailingAverage(
  values: readonly number[],
  window: number,
): (number | null)[] {
  const out: (number | null)[] = [];
  let total = 0;
  for (let index = 0; index < values.length; index++) {
    total += values[index];
    if (index >= window) total -= values[index - window];
    out.push(index >= window - 1 ? Math.round(total / window) : null);
  }
  return out;
}

export type CashFlowOptions = {
  /** Buckets the rolling average looks back over. */
  window?: number;
  /**
   * Spread each recurring bill across the time it covers instead of landing it whole in the
   * bucket it was paid from.
   *
   * Rent is paid monthly but a pay period is a fortnight, so one period in every ~2.17 gets
   * $2,100 of rent and the others get none. On the real data that single artifact is most of
   * the apparent volatility: recurring charges average $1,161 a period with a standard
   * deviation of $1,128, while everything else averages $1,542 with a deviation of $640. The
   * bills are the smaller half of spending and the larger half of the swing.
   *
   * Levelling redistributes **within** the chart, so every total and average is unchanged —
   * only which bucket a cost is shown in moves. That still makes a single bar a model rather
   * than a record of that fortnight, which is why it is off by default and labelled where it
   * is on.
   */
  levelRecurring?: boolean;
  /**
   * Bills the user declared. Without these a semi-annual premium is not levelled at all —
   * detection cannot see past a 100-day cadence, so the charge lands whole in one bucket and
   * the levelled chart still has the spike it exists to remove.
   */
  bills?: readonly DeclaredBill[];
};

/** Inclusive day count where two date ranges overlap. */
function overlapDays(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): number {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  if (start > end) return 0;
  return daysBetweenKeys(start, end) + 1;
}

/**
 * Allocate one charge across the buckets its cadence covers, in whole cents.
 *
 * Shares are normalised over the buckets actually present rather than over the full cadence,
 * so a bill paid near the end of the history puts all of its cost somewhere on the chart
 * instead of quietly losing the part that covers next month. The final overlapping bucket
 * takes the rounding remainder, which is what keeps the sum exactly equal to the charge.
 */
function allocateAcross(
  costCents: number,
  startKey: string,
  cadenceDays: number,
  buckets: readonly Bucket[],
  into: number[],
): void {
  const endKey = shiftDateKey(startKey, Math.max(1, cadenceDays) - 1);
  const overlaps = buckets.map((bucket) =>
    overlapDays(startKey, endKey, bucket.startKey, bucket.endKey),
  );
  const total = overlaps.reduce((sum, days) => sum + days, 0);
  if (total === 0) return;

  let last = -1;
  overlaps.forEach((days, index) => {
    if (days > 0) last = index;
  });

  let allocated = 0;
  overlaps.forEach((days, index) => {
    if (days === 0) return;
    if (index === last) {
      into[index] += costCents - allocated;
      return;
    }
    const share = Math.round((costCents * days) / total);
    into[index] += share;
    allocated += share;
  });
}

/**
 * What a charge at a given merchant is, for the fixed/variable split and for levelling.
 *
 * `kind` says which side of the split it lands on; `spanDays` says how much time it covers,
 * and is null when it covers no knowable stretch.
 *
 * Declared bills win over detected ones, for the same reason `flow_override` wins over
 * `derived_flow`: the person knows, and the statistics were only ever guessing. A scheduled
 * bill's span is measured from the charge's own date rather than from a constant, so a
 * February-anchored semi-annual bill covers its real 181 days.
 *
 * **An unscheduled bill is a bill with no span.** Propane is not discretionary, so it belongs
 * on the bills side — but spreading it would double-count: two deliveries in one cold winter
 * would each claim the twelve months the declaration names, and the chart would show the money
 * twice. It lands whole where it happened instead. The baseline is unaffected, because that
 * accrues the declared yearly cost rather than the charges.
 */
type ChargeKind = { bill: boolean; spanDays: number | null };

const NOT_A_BILL: ChargeKind = { bill: false, spanDays: null };

/** Every bank string a declaration covers, including the name itself. */
export function billMatcherKeys(bill: DeclaredBill): readonly string[] {
  const matchers =
    bill.matchers && bill.matchers.length > 0 ? bill.matchers : [bill.name];
  return matchers.includes(bill.name) ? matchers : [...matchers, bill.name];
}

function billStatusOf(bill: DeclaredBill): NonNullable<DeclaredBill["status"]> {
  return bill.status ?? "active";
}

/** Active bills only — cancelled and ignored stop levelling, forecasting, and accrual. */
function activeBills(bills: readonly DeclaredBill[]): DeclaredBill[] {
  return bills.filter((bill) => billStatusOf(bill) === "active");
}

function chargesForBill(
  byMerchant: Map<string, AnalyticsRow[]>,
  bill: DeclaredBill,
): AnalyticsRow[] {
  const seen = new Set<string>();
  const rows: AnalyticsRow[] = [];
  for (const key of billMatcherKeys(bill)) {
    for (const row of byMerchant.get(key) ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }
  rows.sort(
    (left, right) =>
      left.transactionDate.localeCompare(right.transactionDate) ||
      left.id.localeCompare(right.id),
  );
  return rows;
}

function claimedByBills(bills: readonly DeclaredBill[]): Map<string, DeclaredBill> {
  const index = new Map<string, DeclaredBill>();
  for (const bill of bills) {
    for (const key of billMatcherKeys(bill)) index.set(key, bill);
  }
  return index;
}

function cadenceSpans(
  rows: readonly AnalyticsRow[],
  bills: readonly DeclaredBill[],
): (merchant: string, chargeDateKey: string) => ChargeKind {
  const declared = claimedByBills(activeBills(bills));
  const detected = new Map(
    recurringMerchants(rows, bills)
      .filter((entry) => !entry.declared)
      .map((entry) => [entry.merchant, entry.cadenceDays]),
  );

  return (merchant, chargeDateKey) => {
    const bill = declared.get(merchant);
    if (bill !== undefined) {
      return {
        bill: true,
        spanDays: bill.scheduled ? spanDays(chargeDateKey, bill.cadenceMonths) : null,
      };
    }
    const days = detected.get(merchant);
    return days === undefined ? NOT_A_BILL : { bill: true, spanDays: days };
  };
}

/**
 * Income and spend per bucket, split into bills and everything else, with the rolling
 * overlay.
 *
 * Pass the **whole** history even when the chart shows one year: a trailing-12 average of
 * the visible window alone would be null everywhere, and slicing after the fact is what
 * lets the first visible month still carry a real average. Recurring merchants are detected
 * over that whole history too, so the set does not change as the window moves.
 */
export function cashFlow(
  rows: readonly AnalyticsRow[],
  buckets: readonly Bucket[],
  options: CashFlowOptions = {},
): CashFlowPoint[] {
  const { window = TRAILING_WINDOW, levelRecurring = false, bills = [] } = options;
  const spanFor = cadenceSpans(rows, bills);
  const grouped = bucketRows(rows, buckets);

  const income = buckets.map((bucket) =>
    (grouped.get(bucket.key) ?? []).reduce(
      (total, row) => total + incomeCentsOf(row),
      0,
    ),
  );
  const external = buckets.map((bucket) =>
    (grouped.get(bucket.key) ?? []).reduce(
      (total, row) => total + externalTransferCentsOf(row),
      0,
    ),
  );
  const fixed = new Array<number>(buckets.length).fill(0);
  const variable = new Array<number>(buckets.length).fill(0);

  buckets.forEach((bucket, index) => {
    for (const row of grouped.get(bucket.key) ?? []) {
      const cost = spendCentsOf(row);
      if (cost === 0) continue;
      const charge = spanFor(effectiveMerchant(row), row.transactionDate);
      if (!charge.bill) {
        variable[index] += cost;
        continue;
      }
      // A credit at a recurring merchant is still that bill's money, but there is no span
      // of time for it to cover — it lands where it happened. Same for an unscheduled bill,
      // whose span is unknowable by construction.
      if (levelRecurring && cost > 0 && charge.spanDays !== null) {
        allocateAcross(cost, row.transactionDate, charge.spanDays, buckets, fixed);
      } else {
        fixed[index] += cost;
      }
    }
  });

  const spend = buckets.map((_, index) => fixed[index] + variable[index]);
  const trailingSpend = trailingAverage(spend, window);
  const trailingIncome = trailingAverage(income, window);
  const trailingNet = trailingAverage(
    buckets.map((_, index) => income[index] - spend[index]),
    window,
  );

  return buckets.map((bucket, index) => ({
    bucket,
    incomeCents: income[index],
    spendCents: spend[index],
    fixedCents: fixed[index],
    variableCents: variable[index],
    netCents: income[index] - spend[index],
    externalTransferCents: external[index],
    trailingSpendCents: trailingSpend[index],
    trailingIncomeCents: trailingIncome[index],
    trailingNetCents: trailingNet[index],
  }));
}

// — Baseline and one-offs ————————————————————————————————————————————————————

export type SpendEvent = {
  label: string;
  cents: number;
  count: number;
};

export type BaselineSplit = {
  /** Ongoing spend — what next month is likely to cost. */
  baselineCents: number;
  /** Spend the user has marked as not repeating. */
  oneOffCents: number;
  /** `baselineCents` per bucket, which is the figure worth planning against. */
  baselinePerBucketCents: number;
  bucketCount: number;
  /** Named one-offs, largest first. Unlabelled ones are collected under one entry. */
  events: SpendEvent[];
  /** True when bills were accrued at their cadence rate rather than counted as posted. */
  levelled: boolean;
  /** The part of `baselineCents` contributed by bills. Zero unless `levelled`. */
  billsCents: number;
};

const UNNAMED_EVENT = "Unnamed one-off";

export type BaselineOptions = {
  /**
   * Accrue bills at their cadence rate instead of counting the charges that happened to post
   * inside the window. Shares the `levelRecurring` setting with the cash-flow chart.
   */
  levelRecurring?: boolean;
  /**
   * The merged recurring table from `recurringMerchants` — detected and declared alike. Only
   * read when levelling.
   */
  bills?: readonly RecurringMerchant[];
  /** The window's buckets, which is how a rate becomes an amount. Required to level. */
  buckets?: readonly Bucket[];
};

/**
 * Split spending into what repeats and what does not.
 *
 * These are reported as two numbers everywhere, never blended: the wedding happened, and
 * saying "you spend $6,800 a month" because of it answers a question nobody asked.
 *
 * **Levelling here accrues, where the chart redistributes, and the difference is deliberate.**
 * `cashFlow` moves a charge between buckets and preserves the total, because a chart is a
 * record of money that moved. This figure answers "what does an ongoing month cost", so a
 * bill contributes its *rate* — a $2,825/year premium is $706 of a three-month window whether
 * or not the charge landed inside it. Counting the charge instead would say $1,412 in the
 * quarter it posts and nothing in the other three, which is the distortion, not the answer.
 * The consequence is that `baselineCents` is no longer the sum of the rows in the window; the
 * caller has to say which mode is showing, and `levelled` is how it knows.
 */
export function baselineSplit(
  rows: readonly AnalyticsRow[],
  bucketCount: number,
  options: BaselineOptions = {},
): BaselineSplit {
  const { levelRecurring = false, bills = [], buckets = [] } = options;
  const windowDays = buckets.reduce(
    (total, bucket) => total + daysBetweenKeys(bucket.startKey, bucket.endKey) + 1,
    0,
  );
  const levelled = levelRecurring && bills.length > 0 && windowDays > 0;
  const levelledBills = bills.filter((entry) => entry.status !== "cancelled");
  const billMerchants = levelled
    ? new Set(levelledBills.map((entry) => entry.merchant))
    : new Set<string>();

  let baselineCents = 0;
  let oneOffCents = 0;
  const events = new Map<string, SpendEvent>();

  for (const row of rows) {
    const cost = spendCentsOf(row);
    if (cost === 0) continue;
    if (!row.excludeFromBaseline) {
      // A charge at a levelled bill is replaced by that bill's accrual below. A credit is
      // not: a refund has no span to spread over, the same exception `cashFlow` makes.
      if (cost > 0 && billMerchants.has(effectiveMerchant(row))) continue;
      baselineCents += cost;
      continue;
    }
    oneOffCents += cost;
    const label = row.eventLabel.trim() || UNNAMED_EVENT;
    const event = events.get(label) ?? { label, cents: 0, count: 0 };
    event.cents += cost;
    event.count += 1;
    events.set(label, event);
  }

  // 365, matching the definition of `annualCents` itself, so a calendar year of window
  // accrues exactly the figure the commitments table prints and the two reconcile by
  // inspection. A leap year over-accrues by a day, which is the cheaper of the two errors.
  const billsCents = levelled
    ? levelledBills.reduce(
        (total, entry) => total + Math.round((entry.annualCents * windowDays) / 365),
        0,
      )
    : 0;
  baselineCents += billsCents;

  return {
    baselineCents,
    oneOffCents,
    baselinePerBucketCents:
      bucketCount > 0 ? Math.round(baselineCents / bucketCount) : 0,
    bucketCount,
    events: [...events.values()].sort(
      (left, right) =>
        right.cents - left.cents || left.label.localeCompare(right.label),
    ),
    levelled,
    billsCents,
  };
}

// — Categories ————————————————————————————————————————————————————————————————

export type CategoryTotal = {
  category: string;
  cents: number;
  /** 0–1 of total spend. */
  share: number;
  count: number;
};

/** Spend by category, largest first. Refunds net off the category they came back to. */
export function spendByCategory(rows: readonly AnalyticsRow[]): CategoryTotal[] {
  const totals = new Map<string, { cents: number; count: number }>();
  let total = 0;

  for (const row of rows) {
    const cost = spendCentsOf(row);
    if (cost === 0) continue;
    const category = effectiveCategory(row);
    const entry = totals.get(category) ?? { cents: 0, count: 0 };
    entry.cents += cost;
    entry.count += 1;
    totals.set(category, entry);
    total += cost;
  }

  return [...totals.entries()]
    .map(([category, entry]) => ({
      category,
      cents: entry.cents,
      count: entry.count,
      share: total > 0 ? entry.cents / total : 0,
    }))
    .sort(
      (left, right) =>
        right.cents - left.cents || left.category.localeCompare(right.category),
    );
}

export type MerchantTotal = {
  merchant: string;
  cents: number;
  share: number;
  count: number;
};

/** Spend by merchant, largest first. Same rules as {@link spendByCategory}. */
export function spendByMerchant(rows: readonly AnalyticsRow[]): MerchantTotal[] {
  const totals = new Map<string, { cents: number; count: number }>();
  let total = 0;

  for (const row of rows) {
    const cost = spendCentsOf(row);
    if (cost === 0) continue;
    const merchant = effectiveMerchant(row);
    const entry = totals.get(merchant) ?? { cents: 0, count: 0 };
    entry.cents += cost;
    entry.count += 1;
    totals.set(merchant, entry);
    total += cost;
  }

  return [...totals.entries()]
    .map(([merchant, entry]) => ({
      merchant,
      cents: entry.cents,
      count: entry.count,
      share: total > 0 ? entry.cents / total : 0,
    }))
    .sort(
      (left, right) =>
        right.cents - left.cents || left.merchant.localeCompare(right.merchant),
    );
}

/** Folded into this bucket so a trend chart does not grow a colour per leftover category. */
export const TREND_OTHER = "Other";
/** Seven named stacks plus Other — eight `--chart-cat-*` tokens. */
export const TREND_TOP_N = 7;

export type CategoryBucketTotal = {
  bucket: Bucket;
  byCategory: Record<string, number>;
};

/**
 * Spend by category inside each bucket, with everything past the top N folded into Other.
 *
 * The key list is computed over the whole window so a category does not appear, vanish and
 * reappear as the months change — that would make the colour mapping lie.
 */
export function spendByCategoryPerBucket(
  rows: readonly AnalyticsRow[],
  buckets: readonly Bucket[],
  topN = TREND_TOP_N,
): { keys: string[]; points: CategoryBucketTotal[] } {
  const overall = spendByCategory(rows);
  const top = overall.slice(0, topN).map((entry) => entry.category);
  const topSet = new Set(top);
  const keys = overall.length > topN ? [...top, TREND_OTHER] : [...top];
  const grouped = bucketRows(rows, buckets);

  const points = buckets.map((bucket) => {
    const byCategory: Record<string, number> = Object.fromEntries(
      keys.map((key) => [key, 0]),
    );
    for (const row of grouped.get(bucket.key) ?? []) {
      const cost = spendCentsOf(row);
      if (cost === 0) continue;
      const category = effectiveCategory(row);
      const key = topSet.has(category) ? category : TREND_OTHER;
      if (key in byCategory) byCategory[key] += cost;
    }
    return { bucket, byCategory };
  });

  return { keys, points };
}

const ASSET_KINDS: ReadonlySet<FinanceAccountKind> = new Set([
  "checking",
  "savings",
  "cash",
  "investment",
]);
const DEBT_KINDS: ReadonlySet<FinanceAccountKind> = new Set(["credit_card", "loan"]);

export function isAssetKind(kind: FinanceAccountKind): boolean {
  return ASSET_KINDS.has(kind);
}

export function isDebtKind(kind: FinanceAccountKind): boolean {
  return DEBT_KINDS.has(kind);
}

export type AssetDebtPoint = {
  bucket: Bucket;
  assetCents: number;
  /** Positive magnitude of what is owed. */
  debtCents: number;
  netCents: number;
};

export type AccountContribution = {
  accountId: string;
  accountName: string;
  kind: FinanceAccountKind;
  startCents: number;
  endCents: number;
  changeCents: number;
};

function sidesOf(running: Map<string, { kind: FinanceAccountKind; cents: number }>): {
  assetCents: number;
  debtCents: number;
  netCents: number;
} {
  let assets = 0;
  let debts = 0;
  for (const { kind, cents } of running.values()) {
    // Debt is only the money still owed. A reconstructed card credit (payments that
    // outran the imported purchases because the feed did not start at zero) is not
    // negative debt — it sits with assets so the ratio cannot go below zero.
    if (isDebtKind(kind) || kind === "other") {
      if (cents < 0) debts += cents;
      else assets += cents;
    } else {
      assets += cents;
    }
  }
  return {
    assetCents: assets,
    debtCents: debts === 0 ? 0 : -debts,
    netCents: assets + debts,
  };
}

function applyRow(
  running: Map<string, { kind: FinanceAccountKind; cents: number; name: string }>,
  row: AnalyticsRow,
): void {
  const current = running.get(row.accountId);
  if (current) {
    current.cents += row.amountCents;
    return;
  }
  running.set(row.accountId, {
    kind: row.accountKind,
    cents: row.amountCents,
    name: row.accountName,
  });
}

/**
 * Assets vs debt at the end of each bucket, among imported accounts only.
 *
 * Checking/savings/cash/investment are assets. Credit cards and loans are debt.
 * `other` follows the sign of that account's running balance so a leftover account is
 * not silently dumped into cash. Not net worth — nothing unimported is here.
 */
export function assetDebtSeries(
  rows: readonly AnalyticsRow[],
  buckets: readonly Bucket[],
): AssetDebtPoint[] {
  const grouped = bucketRows(rows, buckets);
  const firstStart = buckets[0]?.startKey ?? "";
  const running = new Map<
    string,
    { kind: FinanceAccountKind; cents: number; name: string }
  >();
  for (const row of rows) {
    if (row.transactionDate < firstStart) applyRow(running, row);
  }

  return buckets.map((bucket) => {
    for (const row of grouped.get(bucket.key) ?? []) applyRow(running, row);
    return { bucket, ...sidesOf(running) };
  });
}

/**
 * How each imported account moved across a window — the expandable list under cash-vs-debt.
 */
export function accountContributions(
  rows: readonly AnalyticsRow[],
  range: DateRange,
): AccountContribution[] {
  const running = new Map<
    string,
    { kind: FinanceAccountKind; cents: number; name: string }
  >();
  for (const row of rows) {
    if (row.transactionDate < range.startKey) applyRow(running, row);
  }
  const startByAccount = new Map(
    [...running.entries()].map(([id, entry]) => [id, entry.cents]),
  );
  for (const row of rows) {
    if (row.transactionDate >= range.startKey && row.transactionDate <= range.endKey) {
      applyRow(running, row);
    }
  }

  return [...running.entries()]
    .map(([accountId, entry]) => {
      const startCents = startByAccount.get(accountId) ?? 0;
      return {
        accountId,
        accountName: entry.name,
        kind: entry.kind,
        startCents,
        endCents: entry.cents,
        changeCents: entry.cents - startCents,
      };
    })
    .sort(
      (left, right) =>
        Math.abs(right.changeCents) - Math.abs(left.changeCents) ||
        left.accountName.localeCompare(right.accountName),
    );
}

export function debtToAssetRatio(assetCents: number, debtCents: number): number | null {
  if (assetCents <= 0) return null;
  return debtCents / assetCents;
}

// — Recurring merchants ——————————————————————————————————————————————————————

export type RecurringMerchant = {
  merchant: string;
  /** Typical charge, as a positive cost. */
  typicalCents: number;
  /** Standard deviation of the charges, in cents. Near zero is a subscription. */
  deviationCents: number;
  /**
   * The cheapest and dearest charge seen, so a swingy bill can say so.
   *
   * Schedule and amount are **independent** axes and only one of them is a fact the user has
   * to supply. A utility is usually regular in date and wild in amount — SMECO runs $77.95 to
   * $311.13 across 22 charges, St Mary's Water $77.38 to $184.24 — while MetLife Pet is
   * $100.24 twelve times running. Reporting one median for the first two states an estimate
   * as a fact.
   *
   * Unlike a cadence, this needs no declaring: the history already measures it. That is the
   * whole difference between the two axes, and the reason `scheduled` is a stored column and
   * this is not.
   */
  lowCents: number;
  highCents: number;
  chargeCount: number;
  /** Median days between charges. */
  cadenceDays: number;
  /** `typical × 365 ÷ cadence` — what a year of this costs. */
  annualCents: number;
  lastChargeOn: string;
  /**
   * Set when the user declared the cadence rather than the statistics finding it. Null for a
   * detected merchant, where months would be a rounding of an observed gap and not a fact.
   */
  cadenceMonths: number | null;
  /** True when this row came from a declaration. Drives the marker in the table. */
  declared: boolean;
  /**
   * False when the user declared the cost but not a schedule — propane, whose yearly figure
   * is solid and whose delivery date is a tank sensor. Always true for a detected merchant,
   * which was found by having a cadence in the first place.
   */
  scheduled: boolean;
  /** Declared bills carry status so cancelled history can stay visible without being costed. */
  status: "active" | "cancelled" | "ignored";
};

/** Below six charges there is no cadence to speak of, only a coincidence. */
const MIN_RECURRING_CHARGES = 6;
/** Weekly through quarterly. Wider than monthly because rent, utilities and insurance
 * post on their own rhythms and all three are worth catching. */
const MIN_CADENCE_DAYS = 6;
const MAX_CADENCE_DAYS = 100;
/** A charge may vary by this share of its own size and still be "the same bill". Comcast
 * moves a dollar; a grocery run moves a hundred, and that is the difference being tested. */
const RECURRING_VARIANCE_RATIO = 0.25;

function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return Math.round(Math.sqrt(variance));
}

/**
 * Subscriptions and bills, found by **variance alone** — no categories required.
 *
 * This works on the real data because a subscription is defined by not changing: MetLife Pet
 * is $100.24 twelve times with a standard deviation of zero, while a Walmart run at the same
 * merchant swings by a hundred dollars. Cadence then separates a monthly bill from a
 * merchant that simply gets visited a lot.
 *
 * Annualizing is the point of the panel: $34.71 a month is invisible and $416 a year is a
 * decision.
 */
export function recurringMerchants(
  rows: readonly AnalyticsRow[],
  bills: readonly DeclaredBill[] = [],
  /**
   * Where a **declared** bill's charges are read from, when that is not the same set the
   * detection runs over. A commitment does not depend on the window: a yearly premium costs
   * what it costs in a month that holds none of its charges, and reading its amount from the
   * visible slice would make the row blink out of this table whenever someone narrowed the
   * range. Callers with a window pass their whole history here.
   */
  billRows: readonly AnalyticsRow[] = rows,
): RecurringMerchant[] {
  const byMerchant = chargesByMerchant(rows);
  const byMerchantForBills =
    billRows === rows ? byMerchant : chargesByMerchant(billRows);
  const claimed = claimedByBills(bills);

  const found: RecurringMerchant[] = [];
  for (const [merchant, ordered] of byMerchant) {
    // A declaration is the user's answer to the same question, so the statistics do not get
    // to disagree with it — and a semi-annual bill would fail every threshold below anyway.
    // Cancelled and ignored still claim their matchers, so they cannot reappear as detections.
    if (claimed.has(merchant)) continue;
    if (ordered.length < MIN_RECURRING_CHARGES) continue;

    const amounts = ordered.map(spendCentsOf);
    const typicalCents = median(amounts);
    if (typicalCents <= 0) continue;
    const deviationCents = standardDeviation(amounts);
    if (deviationCents > typicalCents * RECURRING_VARIANCE_RATIO) continue;

    const cadenceDays = median(gapsBetween(ordered));
    if (cadenceDays < MIN_CADENCE_DAYS || cadenceDays > MAX_CADENCE_DAYS) continue;

    found.push({
      merchant,
      typicalCents,
      deviationCents,
      lowCents: Math.min(...amounts),
      highCents: Math.max(...amounts),
      chargeCount: ordered.length,
      cadenceDays,
      annualCents: Math.round((typicalCents * 365) / cadenceDays),
      lastChargeOn: ordered[ordered.length - 1].transactionDate,
      cadenceMonths: null,
      declared: false,
      scheduled: true,
      status: "active",
    });
  }

  for (const bill of bills) {
    // Ignored means "detection proposed this and it was never a commitment". It stays off
    // the table permanently. Cancelled stays visible as history.
    if (billStatusOf(bill) === "ignored") continue;

    const charges = chargesForBill(byMerchantForBills, bill);
    const amounts = charges.map(spendCentsOf);
    // The declared amount first, because it survives a window that contains no charge — which
    // is the normal case for a yearly bill and exactly when the commitment still exists.
    const typicalCents =
      bill.expectedCents ?? (amounts.length > 0 ? median(amounts) : 0);
    if (typicalCents <= 0) continue;

    found.push({
      merchant: bill.name,
      typicalCents,
      deviationCents: standardDeviation(amounts),
      // A declared bill with no charges on file has no observed range; collapsing it onto
      // the declared amount is what makes the table show a single figure rather than a
      // range invented out of nothing.
      lowCents: amounts.length > 0 ? Math.min(...amounts) : typicalCents,
      highCents: amounts.length > 0 ? Math.max(...amounts) : typicalCents,
      chargeCount: charges.length,
      cadenceDays: Math.round(bill.cadenceMonths * (365.2425 / 12)),
      annualCents: annualFromCharge(typicalCents, bill.cadenceMonths),
      lastChargeOn:
        charges[charges.length - 1]?.transactionDate ?? bill.anchorDate ?? "",
      cadenceMonths: bill.cadenceMonths,
      declared: true,
      scheduled: bill.scheduled,
      status: billStatusOf(bill),
    });
  }

  return found.sort(
    (left, right) =>
      right.annualCents - left.annualCents ||
      left.merchant.localeCompare(right.merchant),
  );
}

/** Spending charges grouped by effective merchant, each group in date order. */
function chargesByMerchant(rows: readonly AnalyticsRow[]): Map<string, AnalyticsRow[]> {
  const byMerchant = new Map<string, AnalyticsRow[]>();
  for (const row of rows) {
    if (spendCentsOf(row) <= 0) continue;
    const merchant = effectiveMerchant(row);
    if (merchant === "") continue;
    const bucket = byMerchant.get(merchant);
    if (bucket) bucket.push(row);
    else byMerchant.set(merchant, [row]);
  }
  for (const charges of byMerchant.values()) {
    charges.sort((left, right) =>
      left.transactionDate.localeCompare(right.transactionDate),
    );
  }
  return byMerchant;
}

/** Days between consecutive charges. Empty for a single charge, which has no cadence. */
function gapsBetween(ordered: readonly AnalyticsRow[]): number[] {
  const gaps: number[] = [];
  for (let index = 1; index < ordered.length; index++) {
    gaps.push(
      daysBetweenKeys(
        ordered[index - 1].transactionDate,
        ordered[index].transactionDate,
      ),
    );
  }
  return gaps;
}

// — Cadence proposals ————————————————————————————————————————————————————————

export type CadenceCandidate = {
  merchant: string;
  /** The cadence the gaps look like, in months. */
  cadenceMonths: number;
  typicalCents: number;
  chargeCount: number;
  lastChargeOn: string;
};

/** Two charges is one gap — thin, but enough to *offer* a cadence for confirmation. */
const MIN_CANDIDATE_CHARGES = 2;

/**
 * Merchants whose charges look like they arrive on a cadence, offered as a pre-filled answer.
 *
 * Deliberately far looser than `recurringMerchants`, and deliberately unable to change a
 * number on its own. That function asserts a subscription unprompted, so it demands six
 * charges inside 100 days; a semi-annual bill clears neither bar and never will. This one
 * only fills in a dropdown someone is about to read, where a wrong guess costs one click to
 * correct and a missing guess costs the user working out their own propane schedule.
 *
 * Run it over the **whole** history rather than the visible window: the two charges that make
 * a semi-annual pattern are eight months apart and a six-month window sees only one of them.
 */
export function cadenceCandidates(
  rows: readonly AnalyticsRow[],
  options: { suppressMerchants?: readonly string[] } = {},
): CadenceCandidate[] {
  const suppressed = new Set(options.suppressMerchants ?? []);
  const found: CadenceCandidate[] = [];

  for (const [merchant, ordered] of chargesByMerchant(rows)) {
    if (suppressed.has(merchant)) continue;
    if (ordered.length < MIN_CANDIDATE_CHARGES) continue;

    const amounts = ordered.map(spendCentsOf);
    const typicalCents = median(amounts);
    if (typicalCents <= 0) continue;
    // Spread from the median rather than a standard deviation, which is near-meaningless on
    // the two-charge case this exists to serve.
    const widest = Math.max(...amounts.map((cents) => Math.abs(cents - typicalCents)));
    if (widest > typicalCents * RECURRING_VARIANCE_RATIO) continue;

    const cadenceMonths = cadenceMonthsFromGapDays(median(gapsBetween(ordered)));
    if (cadenceMonths === null) continue;

    found.push({
      merchant,
      cadenceMonths,
      typicalCents,
      chargeCount: ordered.length,
      lastChargeOn: ordered[ordered.length - 1].transactionDate,
    });
  }

  return found.sort((left, right) => left.merchant.localeCompare(right.merchant));
}

// — Upcoming bills ————————————————————————————————————————————————————————————

export type UpcomingBill = {
  merchant: string;
  cadenceMonths: number;
  /** The next date this is expected to land. */
  dueOn: string;
  /** Negative once the expected date has passed without a matching charge. */
  daysAway: number;
  expectedCents: number;
  /** What the forecast is anchored on — the last real charge, or the declared anchor. */
  lastChargeOn: string;
};

/**
 * When each declared bill is next expected, and for how much.
 *
 * A projection from the last charge, not a promise: nothing here reconciles against the
 * charge that eventually arrives, so a bill still listed a week after its date means the
 * import is behind or the date moved, not that the money is missing.
 *
 * Pass the **whole** history. The anchor is the most recent charge, and a window that
 * excludes it would forecast from whichever older charge happened to survive the filter.
 *
 * **Unscheduled bills are absent entirely**, not shown with a soft date. Propane's yearly cost
 * is knowable and its delivery date is not, and a projected date reads as knowledge however
 * carefully the panel is captioned — the parent spec's forecast is honest only because a real
 * cadence stands behind it.
 */
export function upcomingBills(
  rows: readonly AnalyticsRow[],
  bills: readonly DeclaredBill[],
  todayKey: string,
): UpcomingBill[] {
  const byMerchant = chargesByMerchant(rows);

  return bills
    .flatMap((bill) => {
      if (!bill.scheduled || billStatusOf(bill) !== "active") return [];
      const charges = chargesForBill(byMerchant, bill);
      const lastChargeOn =
        charges[charges.length - 1]?.transactionDate ?? bill.anchorDate ?? "";
      if (lastChargeOn === "") return [];

      const expectedCents =
        bill.expectedCents ??
        (charges.length > 0 ? median(charges.map(spendCentsOf)) : 0);
      if (expectedCents <= 0) return [];

      const dueOn = nextDueFrom(lastChargeOn, bill.cadenceMonths, todayKey);
      return [
        {
          merchant: bill.name,
          cadenceMonths: bill.cadenceMonths,
          dueOn,
          daysAway: daysBetweenKeys(todayKey, dueOn),
          expectedCents,
          lastChargeOn,
        },
      ];
    })
    .sort(
      (left, right) =>
        left.dueOn.localeCompare(right.dueOn) ||
        left.merchant.localeCompare(right.merchant),
    );
}

// — One-off suggestions ——————————————————————————————————————————————————————

export type OneOffSuggestion = {
  row: AnalyticsRow;
  cents: number;
  merchant: string;
  category: string;
  /** How many times the typical spending row this is. */
  multiple: number;
};

export type OneOffOptions = {
  limit?: number;
  /**
   * Bills the user has declared. Their charges are withheld permanently — a declaration is
   * the answer to this list's question, and continuing to ask is the bug being fixed.
   */
  bills?: readonly DeclaredBill[];
  /**
   * Extra merchants to withhold — typically matchers already claimed by recurring spend, so
   * pizza does not keep showing up as a one-off after it has been grouped.
   */
  suppressMerchants?: readonly string[];
};

/** How far above a typical row a charge has to sit before it is worth asking about. */
const OUTLIER_MULTIPLE = 12;
/** Nothing under this is worth a review row however unusual it looks. */
const OUTLIER_FLOOR_CENTS = 50_000;

/**
 * Charges large enough that they might be an event rather than a month.
 *
 * **Suggestions only.** Auto-excluding these would be wrong in a way that compounds: an
 * annual insurance premium is a genuine recurring cost, and dropping it every year would
 * quietly understate what a year costs. So the statistic proposes and the user disposes —
 * `setOneOff` is a confirmation, never a consequence of running this.
 *
 * Rows on a recurring merchant are withheld for the same reason, whether that merchant was
 * detected or declared. Detection alone was not enough: it cannot see a cadence longer than
 * 100 days, so the semi-annual and yearly bills it misses had no way to leave this list at
 * all — the only offers were to exclude them, which is the compounding error above, or to
 * keep seeing them forever.
 */
export function oneOffSuggestions(
  rows: readonly AnalyticsRow[],
  options: OneOffOptions = {},
): OneOffSuggestion[] {
  const { limit = 20, bills = [], suppressMerchants = [] } = options;
  const spending = rows.filter((row) => spendCentsOf(row) > 0);
  if (spending.length === 0) return [];

  const typical = median(spending.map(spendCentsOf));
  const threshold = Math.max(typical * OUTLIER_MULTIPLE, OUTLIER_FLOOR_CENTS);
  const recurring = new Set(
    recurringMerchants(rows, bills).map((entry) => entry.merchant),
  );
  // A declared bill with no charge in this window is absent from the table above but is
  // still declared, and its charge must not resurface the moment the window narrows.
  // Matchers (and cancelled/ignored claims) suppress the same way: the answer has been given.
  for (const bill of bills) {
    for (const key of billMatcherKeys(bill)) recurring.add(key);
  }
  for (const merchant of suppressMerchants) recurring.add(merchant);

  return spending
    .filter((row) => !row.excludeFromBaseline)
    .filter((row) => spendCentsOf(row) >= threshold)
    .filter((row) => !recurring.has(effectiveMerchant(row)))
    .map((row) => ({
      row,
      cents: spendCentsOf(row),
      merchant: effectiveMerchant(row),
      category: effectiveCategory(row),
      multiple: typical > 0 ? spendCentsOf(row) / typical : 0,
    }))
    .sort((left, right) => right.cents - left.cents)
    .slice(0, limit);
}

// — Balances over time ————————————————————————————————————————————————————————

export type BalancePoint = {
  bucket: Bucket;
  /** Sum of every amount on every account up to this bucket's end. */
  balanceCents: number;
};

/**
 * The tracked balance at the end of each bucket — cash minus card debt.
 *
 * Deliberately not called net worth: it is the sum of the accounts that have been imported,
 * so a mortgage, a car and a retirement account are all missing from it. Naming it for what
 * it measures is what stops it being read as something it is not.
 */
export function balanceSeries(
  rows: readonly AnalyticsRow[],
  buckets: readonly Bucket[],
): BalancePoint[] {
  const grouped = bucketRows(rows, buckets);
  // Anything before the first bucket still happened, and its money is still in the account.
  const firstStart = buckets[0]?.startKey ?? "";
  let running = rows
    .filter((row) => row.transactionDate < firstStart)
    .reduce((total, row) => total + row.amountCents, 0);

  return buckets.map((bucket) => {
    for (const row of grouped.get(bucket.key) ?? []) running += row.amountCents;
    return { bucket, balanceCents: running };
  });
}

// — Coverage ——————————————————————————————————————————————————————————————————

export type CoverageMismatch = {
  accountId: string;
  accountName: string;
  ledgerBalanceCents: number;
  anchoredBalanceCents: number;
  mismatchCents: number;
};

export type CoverageGap = {
  /** The day from which every account itemizes, so category totals are complete. */
  completeFrom: string | null;
  /** Accounts whose history starts after the earliest transaction, newest start first. */
  lateAccounts: { accountName: string; firstSeen: string }[];
  /**
   * Unpaired outflow transfers that still stand in for spending we cannot itemize —
   * before `completeFrom`, or inside a mid-history statement hole.
   */
  unitemizedCents: number;
  /** Missing cycles on an account that already has statements. */
  holes: CoverageHole[];
  /** Accounts whose ledger sum disagrees with the statement-anchored headline. */
  mismatches: CoverageMismatch[];
};

/**
 * What the category charts and headline balances cannot see.
 *
 * Late-starting accounts still matter: a card that only appears in 2025 hides earlier
 * spending as lump payments from checking. Mid-history holes matter too — a year of
 * missing Capital One card PDFs is not a late start once 2019–2024 rows exist.
 *
 * Only **unpaired** transfer legs count as unitemized. A transfer whose other half is
 * in the data hides nothing.
 */
export function coverageGap(
  rows: readonly AnalyticsRow[],
  statements: readonly ReconcileStatement[] = [],
): CoverageGap {
  const empty: CoverageGap = {
    completeFrom: null,
    lateAccounts: [],
    unitemizedCents: 0,
    holes: [],
    mismatches: [],
  };
  if (rows.length === 0 && statements.length === 0) return empty;

  const report = reconcileAccounts(statements, rows);

  const firstByAccount = new Map<string, { accountName: string; firstSeen: string }>();
  for (const row of rows) {
    const seen = firstByAccount.get(row.accountId);
    if (!seen || row.transactionDate < seen.firstSeen) {
      firstByAccount.set(row.accountId, {
        accountName: row.accountName,
        firstSeen: row.transactionDate,
      });
    }
  }

  const starts = [...firstByAccount.values()];
  const earliest = starts.length
    ? starts.reduce(
        (oldest, entry) => (entry.firstSeen < oldest ? entry.firstSeen : oldest),
        starts[0].firstSeen,
      )
    : null;
  const latestStart = starts.length
    ? starts.reduce(
        (latest, entry) => (entry.firstSeen > latest ? entry.firstSeen : latest),
        starts[0].firstSeen,
      )
    : null;
  const completeFrom =
    earliest && latestStart && latestStart > earliest ? latestStart : null;

  const unitemizedCents = rows
    .filter((row) => {
      if (effectiveFlow(row) !== "internal_transfer") return false;
      if (row.transferGroupId !== null) return false;
      if (row.amountCents >= 0) return false;
      if (completeFrom && row.transactionDate < completeFrom) return true;
      return report.holes.some((hole) => dateFallsInHole(row.transactionDate, hole));
    })
    .reduce((total, row) => total - row.amountCents, 0);

  return {
    completeFrom,
    lateAccounts: starts
      .filter((entry) => earliest !== null && entry.firstSeen > earliest)
      .sort((left, right) => right.firstSeen.localeCompare(left.firstSeen)),
    unitemizedCents,
    holes: report.holes,
    mismatches: report.accounts
      .filter((account) => account.mismatchCents !== 0)
      .map((account) => ({
        accountId: account.accountId,
        accountName: account.accountName,
        ledgerBalanceCents: account.ledgerBalanceCents,
        anchoredBalanceCents: account.anchoredBalanceCents,
        mismatchCents: account.mismatchCents,
      })),
  };
}

// — Window helpers ————————————————————————————————————————————————————————————

/** The span a set of rows covers, or null when there are none. */
export function rowsRange(rows: readonly AnalyticsRow[]): DateRange | null {
  if (rows.length === 0) return null;
  let startKey = rows[0].transactionDate;
  let endKey = rows[0].transactionDate;
  for (const row of rows) {
    if (row.transactionDate < startKey) startKey = row.transactionDate;
    if (row.transactionDate > endKey) endKey = row.transactionDate;
  }
  return { startKey, endKey };
}

/** `months` whole calendar months ending with the one `endKey` falls in. */
export function trailingRange(endKey: string, months: number): DateRange {
  let key = monthKey(endKey);
  for (let step = 1; step < months; step++) key = previousMonthKey(key);
  return { startKey: `${key}-01`, endKey };
}

/** Rows inside an inclusive window. */
export function rowsInRange(
  rows: readonly AnalyticsRow[],
  range: DateRange,
): AnalyticsRow[] {
  return rows.filter(
    (row) =>
      row.transactionDate >= range.startKey && row.transactionDate <= range.endKey,
  );
}
