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

import type { FinanceFlowKind } from "@/db/schema";
import { daysBetweenKeys, shiftDateKey } from "@/lib/schedule/geometry";
import { categoryFromBank, UNCATEGORIZED } from "./classify/categories";
import { detectIncome, normalizedMonthlyIncome, type Payday } from "./classify/income";
import { normalizeMerchant } from "./classify/merchant";
import type { PayPeriod } from "./classify/payPeriods";
import { matchRule } from "./classify/rules";

/** One classified transaction, as every panel reads it. */
export type AnalyticsRow = {
  id: string;
  accountId: string;
  accountName: string;
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
  const { window = TRAILING_WINDOW, levelRecurring = false } = options;
  const cadenceByMerchant = new Map(
    recurringMerchants(rows).map((entry) => [entry.merchant, entry.cadenceDays]),
  );
  const grouped = bucketRows(rows, buckets);

  const income = buckets.map((bucket) =>
    (grouped.get(bucket.key) ?? []).reduce(
      (total, row) => total + incomeCentsOf(row),
      0,
    ),
  );
  const fixed = new Array<number>(buckets.length).fill(0);
  const variable = new Array<number>(buckets.length).fill(0);

  buckets.forEach((bucket, index) => {
    for (const row of grouped.get(bucket.key) ?? []) {
      const cost = spendCentsOf(row);
      if (cost === 0) continue;
      const cadence = cadenceByMerchant.get(effectiveMerchant(row));
      if (cadence === undefined) {
        variable[index] += cost;
        continue;
      }
      // A credit at a recurring merchant is still that bill's money, but there is no span
      // of time for it to cover — it lands where it happened.
      if (levelRecurring && cost > 0) {
        allocateAcross(cost, row.transactionDate, cadence, buckets, fixed);
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
};

const UNNAMED_EVENT = "Unnamed one-off";

/**
 * Split spending into what repeats and what does not.
 *
 * These are reported as two numbers everywhere, never blended: the wedding happened, and
 * saying "you spend $6,800 a month" because of it answers a question nobody asked.
 */
export function baselineSplit(
  rows: readonly AnalyticsRow[],
  bucketCount: number,
): BaselineSplit {
  let baselineCents = 0;
  let oneOffCents = 0;
  const events = new Map<string, SpendEvent>();

  for (const row of rows) {
    const cost = spendCentsOf(row);
    if (cost === 0) continue;
    if (!row.excludeFromBaseline) {
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

// — Recurring merchants ——————————————————————————————————————————————————————

export type RecurringMerchant = {
  merchant: string;
  /** Typical charge, as a positive cost. */
  typicalCents: number;
  /** Standard deviation of the charges, in cents. Near zero is a subscription. */
  deviationCents: number;
  chargeCount: number;
  /** Median days between charges. */
  cadenceDays: number;
  /** `typical × 365 ÷ cadence` — what a year of this costs. */
  annualCents: number;
  lastChargeOn: string;
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
export function recurringMerchants(rows: readonly AnalyticsRow[]): RecurringMerchant[] {
  const byMerchant = new Map<string, AnalyticsRow[]>();
  for (const row of rows) {
    if (spendCentsOf(row) <= 0) continue;
    const merchant = effectiveMerchant(row);
    if (merchant === "") continue;
    const bucket = byMerchant.get(merchant);
    if (bucket) bucket.push(row);
    else byMerchant.set(merchant, [row]);
  }

  const found: RecurringMerchant[] = [];
  for (const [merchant, charges] of byMerchant) {
    if (charges.length < MIN_RECURRING_CHARGES) continue;
    const ordered = [...charges].sort((left, right) =>
      left.transactionDate.localeCompare(right.transactionDate),
    );

    const amounts = ordered.map(spendCentsOf);
    const typicalCents = median(amounts);
    if (typicalCents <= 0) continue;
    const deviationCents = standardDeviation(amounts);
    if (deviationCents > typicalCents * RECURRING_VARIANCE_RATIO) continue;

    const gaps: number[] = [];
    for (let index = 1; index < ordered.length; index++) {
      gaps.push(
        daysBetweenKeys(
          ordered[index - 1].transactionDate,
          ordered[index].transactionDate,
        ),
      );
    }
    const cadenceDays = median(gaps);
    if (cadenceDays < MIN_CADENCE_DAYS || cadenceDays > MAX_CADENCE_DAYS) continue;

    found.push({
      merchant,
      typicalCents,
      deviationCents,
      chargeCount: ordered.length,
      cadenceDays,
      annualCents: Math.round((typicalCents * 365) / cadenceDays),
      lastChargeOn: ordered[ordered.length - 1].transactionDate,
    });
  }

  return found.sort(
    (left, right) =>
      right.annualCents - left.annualCents ||
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
 * Rows on a recurring merchant are withheld for the same reason.
 */
export function oneOffSuggestions(
  rows: readonly AnalyticsRow[],
  limit = 20,
): OneOffSuggestion[] {
  const spending = rows.filter((row) => spendCentsOf(row) > 0);
  if (spending.length === 0) return [];

  const typical = median(spending.map(spendCentsOf));
  const threshold = Math.max(typical * OUTLIER_MULTIPLE, OUTLIER_FLOOR_CENTS);
  const recurring = new Set(recurringMerchants(rows).map((entry) => entry.merchant));

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

export type CoverageGap = {
  /** The day from which every account itemizes, so category totals are complete. */
  completeFrom: string | null;
  /** Accounts whose history starts after the earliest transaction, newest start first. */
  lateAccounts: { accountName: string; firstSeen: string }[];
  /** Spend that exists only as lump card payments, before `completeFrom`. */
  unitemizedCents: number;
};

/**
 * What the category charts cannot see.
 *
 * The Capital One card itemizes from 2025-08-10, but payments to it run from 2023-08-04:
 * $109,248 of real spending exists in this data only as lump transfers. A category chart
 * over "all time" is therefore missing six figures, and the honest fix is to say so on the
 * page rather than to estimate the missing rows into existence.
 */
export function coverageGap(rows: readonly AnalyticsRow[]): CoverageGap {
  if (rows.length === 0) {
    return { completeFrom: null, lateAccounts: [], unitemizedCents: 0 };
  }

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
  const earliest = starts.reduce(
    (oldest, entry) => (entry.firstSeen < oldest ? entry.firstSeen : oldest),
    starts[0].firstSeen,
  );
  const completeFrom = starts.reduce(
    (latest, entry) => (entry.firstSeen > latest ? entry.firstSeen : latest),
    starts[0].firstSeen,
  );

  // Only the **unpaired** legs. A transfer whose other half is in the data hides nothing —
  // the savings moved, and both sides are visible. It is the payment to a card that had not
  // been imported yet that stands in for purchases nobody can itemize, so counting paired
  // transfers here would inflate the gap with money that is fully accounted for.
  const unitemizedCents = rows
    .filter(
      (row) =>
        row.transactionDate < completeFrom &&
        effectiveFlow(row) === "internal_transfer" &&
        row.transferGroupId === null &&
        row.amountCents < 0,
    )
    .reduce((total, row) => total - row.amountCents, 0);

  return {
    completeFrom: completeFrom > earliest ? completeFrom : null,
    lateAccounts: starts
      .filter((entry) => entry.firstSeen > earliest)
      .sort((left, right) => right.firstSeen.localeCompare(left.firstSeen)),
    unitemizedCents,
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
