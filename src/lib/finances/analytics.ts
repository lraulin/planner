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
import { daysBetweenKeys } from "@/lib/schedule/geometry";
import { categoryFromBank, UNCATEGORIZED } from "./classify/categories";
import type { Payday } from "./classify/income";
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
  excludeFromBaseline: boolean;
  eventLabel: string;
};

/**
 * The flow to report this row as.
 *
 * The fallback is not dead code: a row imported since the last reclassify has no derived
 * flow at all, and a dashboard that silently dropped it would under-report spending without
 * saying so.
 */
export function effectiveFlow(row: AnalyticsRow): FinanceFlowKind {
  return (
    row.flowOverride ?? row.derivedFlow ?? (row.amountCents > 0 ? "refund" : "spend")
  );
}

/**
 * The category to report this row under, in the order the founding spec's column split
 * implies: the user's own, then the classifier's, then the bank's vocabulary mapped onto
 * our taxonomy, then an honest admission.
 */
export function effectiveCategory(row: AnalyticsRow): string {
  const own = row.category?.trim();
  if (own) return own;
  if (row.derivedCategory) return row.derivedCategory;
  return categoryFromBank(row.sourceCategory) ?? UNCATEGORIZED;
}

/** Merchant identity for grouping — a rule's canonical name when one claimed the row. */
export function effectiveMerchant(row: AnalyticsRow): string {
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
 */
export function spendCentsOf(row: AnalyticsRow): number {
  return isSpending(effectiveFlow(row)) ? -row.amountCents : 0;
}

export function incomeCentsOf(row: AnalyticsRow): number {
  return effectiveFlow(row) === "income" ? row.amountCents : 0;
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
 * Rebuild the paydays from rows the classifier already marked as income.
 *
 * The cadence detector runs inside `reclassify` and its answer is stored on the rows, so the
 * dashboard reads that answer back rather than re-deriving it. Same-day deposits from one
 * employer are one payday — a bonus that posts with the check must not open a second pay
 * period a day wide.
 */
export function paydaysFrom(rows: readonly AnalyticsRow[]): Payday[] {
  const byKey = new Map<string, Payday>();
  for (const row of rows) {
    if (effectiveFlow(row) !== "income") continue;
    const employer = effectiveMerchant(row);
    const key = `${row.transactionDate}|${employer}`;
    const payday = byKey.get(key) ?? {
      dateKey: row.transactionDate,
      employer,
      amountCents: 0,
      transactionIds: [],
    };
    payday.amountCents += row.amountCents;
    payday.transactionIds.push(row.id);
    byKey.set(key, payday);
  }

  return [...byKey.values()].sort(
    (left, right) =>
      left.dateKey.localeCompare(right.dateKey) ||
      left.employer.localeCompare(right.employer),
  );
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
  /** Positive cost. */
  spendCents: number;
  /** `income − spend`. The only figure here that may be negative. */
  netCents: number;
  /** Trailing average of `spendCents`, or null until the window is full. */
  trailingSpendCents: number | null;
  /** Trailing average of `incomeCents`, or null until the window is full. */
  trailingIncomeCents: number | null;
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

/**
 * Income and spend per bucket, with the rolling overlay.
 *
 * Pass the **whole** history even when the chart shows one year: a trailing-12 average of
 * the visible window alone would be null everywhere, and slicing after the fact is what
 * lets the first visible month still carry a real average.
 */
export function cashFlow(
  rows: readonly AnalyticsRow[],
  buckets: readonly Bucket[],
  window = TRAILING_WINDOW,
): CashFlowPoint[] {
  const grouped = bucketRows(rows, buckets);
  const totals = buckets.map((bucket) => {
    const inBucket = grouped.get(bucket.key) ?? [];
    let incomeCents = 0;
    let spendCents = 0;
    for (const row of inBucket) {
      incomeCents += incomeCentsOf(row);
      spendCents += spendCentsOf(row);
    }
    return { bucket, incomeCents, spendCents };
  });

  const trailingSpend = trailingAverage(
    totals.map((entry) => entry.spendCents),
    window,
  );
  const trailingIncome = trailingAverage(
    totals.map((entry) => entry.incomeCents),
    window,
  );

  return totals.map((entry, index) => ({
    ...entry,
    netCents: entry.incomeCents - entry.spendCents,
    trailingSpendCents: trailingSpend[index],
    trailingIncomeCents: trailingIncome[index],
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

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

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

  // Transfers out before every account was itemizing are purchases we will never see the
  // detail of — that is exactly the money the gap hides.
  const unitemizedCents = rows
    .filter(
      (row) =>
        row.transactionDate < completeFrom &&
        effectiveFlow(row) === "internal_transfer" &&
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
