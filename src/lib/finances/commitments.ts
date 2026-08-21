/**
 * Commitments — the money that is already spoken for, in two tiers.
 *
 * **Tier 1, subscriptions and bills** (`finance_recurring_bills`): charges *unless you cancel*.
 * Exact amount, exact date, and a status, because the thing most likely to be wrong about a
 * subscription list is that some of it is already dead.
 *
 * **Tier 2, recurring spend** (`finance_recurring_spend`): pizza, groceries. Cadence known, the
 * amount fuzzy and derived from history, and it costs nothing unless you go and buy it. It
 * exists because `availableToSpend` subtracted bills but not the groceries that were certainly
 * coming, leaving the headline optimistic by a few hundred dollars a week.
 *
 * There is no tier 3. See `agent-os/specs/2026-08-16-1938-commitments/` D0.
 *
 * **What this module owns is identity.** A commitment is named by the user and *matched* on the
 * bank's strings — `Pizza` covering both `PIZZA HUT` and `DOMINOS`, `Taylor Gas` covering the
 * two spellings on file. The predecessor design used one column for both jobs, which is why
 * `1PASSWORDTORONTOON` could not be renamed and why nothing could ever span two merchants.
 * `matcherIndex` + `resolveMerchant` are that split, and they are deliberately the only way the
 * rest of the module gets from a transaction to a commitment.
 *
 * **Period boundaries are fixed, not rolling.** `periodIndex` anchors on a known Monday and
 * divides, so the buckets do not move with `todayKey`. That matters more than it looks: the
 * rate in `recurringSpendRate` and the "spent so far" in `recurringSpendHeld`
 * (`available.ts`) must measure the *same* week, and a rolling seven-day window would let one
 * count a pizza the other had already dropped.
 *
 * Pure, `YYYY-MM-DD` keys throughout, no `Date` for calendar arithmetic, `todayKey` always
 * supplied by the caller (`agent-os/standards/development/dates.md`).
 */

import type { CommitmentStatus, RecurringSpendPeriod } from "@/db/schema";
import { daysBetweenKeys, shiftDateKey } from "@/lib/schedule/geometry";
import {
  annualCents,
  cadenceDaysApprox,
  cadenceOf,
  nextDueFrom,
  previousDueDate,
  type Cadence,
  nextDueDate,
  shiftDateKeyMonths,
  type StoredBill,
} from "./recurringBills";
import type { Payday } from "./classify/income";

/**
 * A recurring-spend entry as the table holds it. The tier 2 counterpart to `StoredBill`.
 *
 * `expectedCents` is meaningful only when `amountSource` is `"pinned"`; under `"auto"` the rate
 * comes from `recurringSpendRate` on every read, which is what keeps this tier maintenance-free.
 */
export type StoredSpend = {
  id: string;
  name: string;
  matchers: readonly string[];
  period: RecurringSpendPeriod;
  amountSource: "auto" | "pinned";
  expectedCents: number | null;
  active: boolean;
  /** A `FINANCE_CATEGORIES` value, or empty. Also categorises the charges it matches. */
  category: string;
  notes?: string;
};

/** A bill as the table now holds it: named by the user, matched on the bank's strings. */
export type StoredBillRow = StoredBill & {
  id: string;
  matchers: readonly string[];
  status: CommitmentStatus;
  cancelledOn: string | null;
  url: string;
  /** A `FINANCE_CATEGORIES` value, or empty. Also categorises the charges it matches. */
  category: string;
  notes?: string;
};

/**
 * The shared view both tables project into, so the dashboard and the Commitments page
 * cannot grow a second, slightly different idea of what a commitment is.
 */
export type Commitment = {
  kind: "bill" | "spend";
  id: string;
  name: string;
  matchers: readonly string[];
};

export function asBillCommitment(bill: StoredBillRow): Commitment {
  return {
    kind: "bill",
    id: bill.id,
    name: bill.name,
    matchers: bill.matchers,
  };
}

export function asSpendCommitment(entry: StoredSpend): Commitment {
  return {
    kind: "spend",
    id: entry.id,
    name: entry.name,
    matchers: entry.matchers,
  };
}

/** Which commitment a bank merchant string belongs to. */
export type CommitmentRef = {
  kind: "bill" | "spend";
  id: string;
  /** The user's name for it — and the key everything downstream groups by. */
  name: string;
};

/**
 * Raised when two commitments claim the same bank merchant.
 *
 * Postgres cannot express "unique across two tables", so this is the enforcement point, and it
 * has to be an error rather than a silent last-writer-wins: a merchant claimed twice has its
 * charges counted twice in the rate, in the accrual, and in every figure built on either.
 */
export class MatcherConflictError extends Error {
  constructor(
    readonly merchant: string,
    readonly heldBy: string,
  ) {
    super(
      `"${merchant}" already belongs to the commitment "${heldBy}". Free it there first.`,
    );
    this.name = "MatcherConflictError";
  }
}

/**
 * Every bank merchant string mapped to the commitment that claims it.
 *
 * Throws on a collision rather than picking a winner. Callers that are merely *reading* have
 * already been protected by the mutation, so a throw here means the invariant was broken by
 * something that bypassed it — which is worth surfacing loudly rather than absorbing.
 */
export function matcherIndex(
  bills: readonly StoredBillRow[],
  spend: readonly StoredSpend[],
): Map<string, CommitmentRef> {
  const index = new Map<string, CommitmentRef>();

  function claim(matchers: readonly string[], ref: CommitmentRef): void {
    for (const merchant of matchers) {
      const existing = index.get(merchant);
      if (existing && existing.id !== ref.id) {
        throw new MatcherConflictError(merchant, existing.name);
      }
      index.set(merchant, ref);
    }
  }

  for (const bill of bills) {
    claim(bill.matchers, { kind: "bill", id: bill.id, name: bill.name });
  }
  for (const entry of spend) {
    claim(entry.matchers, { kind: "spend", id: entry.id, name: entry.name });
  }

  return index;
}

/**
 * The key to group a charge under: the commitment's name where one claims it, else the
 * merchant as it stands.
 *
 * This is the one function that replaces a bare `effectiveMerchant()` in the reporting paths,
 * and doing it in exactly one place is what makes "Pizza" collapse Pizza Hut and Domino's
 * everywhere at once rather than in whichever panels remembered to.
 */
export function resolveMerchant(
  effective: string,
  index: ReadonlyMap<string, CommitmentRef>,
): string {
  return index.get(effective)?.name ?? effective;
}

/**
 * The Monday period boundaries are counted from. Arbitrary but fixed — the value matters only
 * in that it never changes, since every bucket edge in this module is derived from it.
 */
const PERIOD_EPOCH = "2024-01-01";

/** How many periods of history the auto rate looks back over. Six months of weeks. */
export const RATE_LOOKBACK_PERIODS = 26;

/**
 * Which period a day falls in, as a stable integer.
 *
 * Weeks divide from a fixed Monday; months are `year × 12 + month`, so no day arithmetic is
 * involved and a short February cannot shift a boundary. `Math.floor` rather than truncation so
 * dates before the epoch bucket correctly instead of folding two weeks into one at zero.
 */
export function periodIndex(dateKey: string, period: RecurringSpendPeriod): number {
  if (period === "month") {
    return Number(dateKey.slice(0, 4)) * 12 + Number(dateKey.slice(5, 7));
  }
  return Math.floor(daysBetweenKeys(PERIOD_EPOCH, dateKey) / 7);
}

/** The first day of a period, given the index `periodIndex` produced. */
export function periodStartKey(index: number, period: RecurringSpendPeriod): string {
  if (period === "month") {
    // `periodIndex` is `year × 12 + month` with month 1-based, so month 12 of a year lands on
    // the year's own multiple and has to come back out as December rather than as next January.
    const year = Math.floor((index - 1) / 12);
    const month = index - year * 12;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  }
  return shiftDateKey(PERIOD_EPOCH, index * 7);
}

/** How many days a period spans. Seven, or the length of the calendar month. */
export function periodLengthDays(index: number, period: RecurringSpendPeriod): number {
  if (period === "month") {
    return daysBetweenKeys(
      periodStartKey(index, period),
      periodStartKey(index + 1, period),
    );
  }
  return 7;
}

/** A charge counting toward a commitment. Cost is positive, as `spendCents` reports it. */
export type CommitmentCharge = {
  dateKey: string;
  costCents: number;
};

export type SpendRate = {
  /** What a period of this costs — the median, or the pinned figure. */
  ratePerPeriodCents: number;
  /** True when the figure was stated by the user rather than derived. */
  pinned: boolean;
  /** What history says, always — so a pinned rate cannot quietly go stale beside it. */
  observedCents: number;
  /** Periods the median was taken over, including ones with no spend. */
  periodsObserved: number;
  lowCents: number;
  highCents: number;
  /** The day of week most charges land on, 0 = Sunday, or null when there is no clear one. */
  modalDayOfWeek: number | null;
};

/**
 * What a period of this recurring spend costs, from history.
 *
 * **Median of per-period totals, and empty periods count as zero.** Summing the group per
 * period is what makes "either Pizza Hut or Domino's" need no special handling — which of them
 * Friday was is not a question worth answering, and two pizzas in one week should read as a
 * higher rate rather than as an error. Including the empty periods is what keeps the figure
 * honest: if half the weeks have no pizza the median falls, and a median of zero is the correct
 * verdict that this is not a weekly commitment at all.
 *
 * The window starts at the first charge rather than a flat 26 periods back, so a commitment
 * created last month is not averaged against five months of zeroes it could not have spent in.
 */
export function recurringSpendRate(
  entry: StoredSpend,
  charges: readonly CommitmentCharge[],
  todayKey: string,
): SpendRate {
  const pinned = entry.amountSource === "pinned" && entry.expectedCents !== null;

  const past = charges.filter((charge) => charge.dateKey <= todayKey);
  if (past.length === 0) {
    return {
      ratePerPeriodCents: pinned ? (entry.expectedCents ?? 0) : 0,
      pinned,
      observedCents: 0,
      periodsObserved: 0,
      lowCents: 0,
      highCents: 0,
      modalDayOfWeek: null,
    };
  }

  const currentPeriod = periodIndex(todayKey, entry.period);
  const firstPeriod = past.reduce(
    (earliest, charge) => Math.min(earliest, periodIndex(charge.dateKey, entry.period)),
    currentPeriod,
  );

  // The current period is excluded: it is still in progress, and a Monday reading would
  // otherwise drag the median toward zero with a week that has four days left to run.
  const from = Math.max(firstPeriod, currentPeriod - RATE_LOOKBACK_PERIODS);
  const totals = new Map<number, number>();
  for (let period = from; period < currentPeriod; period++) totals.set(period, 0);

  for (const charge of past) {
    const period = periodIndex(charge.dateKey, entry.period);
    if (period < from || period >= currentPeriod) continue;
    totals.set(period, (totals.get(period) ?? 0) + charge.costCents);
  }

  const sorted = [...totals.values()].sort((left, right) => left - right);
  const observedCents = sorted.length === 0 ? 0 : median(sorted);

  return {
    ratePerPeriodCents: pinned ? (entry.expectedCents ?? 0) : observedCents,
    pinned,
    observedCents,
    periodsObserved: sorted.length,
    lowCents: sorted.length === 0 ? 0 : sorted[0],
    highCents: sorted.length === 0 ? 0 : sorted[sorted.length - 1],
    modalDayOfWeek: modalDayOfWeek(past),
  };
}

/** Median of an already-sorted list. Even lengths average the middle pair, rounded to cents. */
function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/**
 * The weekday most of these charges land on, for display only.
 *
 * Derived rather than stored: it is a description of the history, and a stored copy would be a
 * second answer to a question the charges already settle. Null when nothing has a plurality,
 * because "Fridays" on a habit with no pattern would be an invention.
 */
function modalDayOfWeek(charges: readonly CommitmentCharge[]): number | null {
  const counts = new Map<number, number>();
  for (const charge of charges) {
    const day = new Date(`${charge.dateKey}T00:00:00Z`).getUTCDay();
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  let best: number | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [day, count] of counts) {
    if (count > bestCount) {
      best = day;
      bestCount = count;
      tied = false;
    } else if (count === bestCount) {
      tied = true;
    }
  }

  return tied || bestCount * 2 <= charges.length ? null : best;
}

/**
 * A subscription whose expected charge never arrived.
 *
 * This is the check that catches the dead half of a detected subscription list — the streaming
 * services that were cancelled or never activated and went on being counted.
 */
export type StaleSubscription = {
  billId: string;
  name: string;
  /** When the charge was expected. */
  expectedOn: string;
  /** What it would have been, when the bill states an amount. */
  expectedCents: number | null;
  /** How far past due, in days. */
  overdueDays: number;
};

/**
 * The three dates a bill's anchor implies, in one place because the column means two things.
 *
 * `anchorDate` was read as **the next charge** by the Commitments grid — a date typed into a
 * column headed "Next charge" — and as **the period start** by the set-aside accrual, which
 * treats it as the last charge when no history reaches back far enough. Both readings are
 * defensible and the column cannot hold both, so a future anchor accruing from itself would
 * have run the accrual window backwards.
 *
 * The rule settled here: **an anchor later than the last posted charge is the charge being
 * waited for**, and the period it accrues over is the cadence ending on it. Everything else
 * walks from the last charge on file, which is an observed fact and the better anchor whenever
 * there is one.
 */
export type BillAnchor = {
  /** Where the current accrual period began. Null when nothing anchors it. */
  periodStartKey: string | null;
  /**
   * The charge being waited for. May be in the past — that is exactly what overdue means, and
   * why this is not the same field as `nextDueKey`.
   */
  expectedKey: string | null;
  /** The next charge at or after today: what the editable Next charge column shows. */
  nextDueKey: string | null;
};

export function billAnchor(
  bill: StoredBill,
  lastCharge: string | null,
  todayKey: string,
): BillAnchor {
  const cadence = cadenceOf(bill);

  if (
    bill.anchorDate !== null &&
    (lastCharge === null || bill.anchorDate > lastCharge)
  ) {
    return {
      periodStartKey: previousDueDate(bill.anchorDate, cadence),
      expectedKey: bill.anchorDate,
      nextDueKey:
        bill.anchorDate >= todayKey
          ? bill.anchorDate
          : nextDueFrom(bill.anchorDate, cadence, todayKey),
    };
  }

  if (lastCharge === null) {
    return { periodStartKey: bill.anchorDate, expectedKey: null, nextDueKey: null };
  }

  return {
    periodStartKey: lastCharge,
    expectedKey: nextDueDate(lastCharge, cadence),
    nextDueKey: nextDueFrom(lastCharge, cadence, todayKey),
  };
}

/**
 * Two charges from different spellings of the same bill, arriving too close together.
 *
 * **What this is for.** A vendor renames itself and the same bill turns up twice on the review
 * list, so its second spelling gets added to the commitment that already exists. That is a
 * rename when the two series *hand off* — the old string stops, the new one starts, and the
 * merged history is one clean run of charges about a cadence apart. It is two separate bills
 * when they overlap, and the merge would then quietly double what the commitment costs.
 *
 * **The test is a cadence, not the calendar.** For each charge from the spelling being added,
 * find the nearest charge already on the commitment: closer than 60% of a cadence and the two
 * were charged in the same cycle, which a rename could not produce. This needs no notion of
 * "the same month", so it reads the same way for a 28-day autoship as for a quarterly bill —
 * and it reports once per new charge rather than once per adjacent pair, so three double-billed
 * months read as three.
 *
 * Reports, never blocks. A vendor migrating billing systems really can charge twice in the
 * month it moves, and this module has proposed rather than applied since the cadence specs.
 */
export type AliasOverlap = {
  /** The charge already on the commitment. */
  existingKey: string;
  /** The charge from the spelling being added. */
  candidateKey: string;
  /** Days between them. */
  gapDays: number;
};

/** Below this share of a cadence, two charges are not one series. */
const OVERLAP_RATIO = 0.6;

export function aliasOverlap(
  existing: readonly { dateKey: string }[],
  candidate: readonly { dateKey: string }[],
  cadence: Cadence,
): AliasOverlap[] {
  const limit = cadenceDaysApprox(cadence) * OVERLAP_RATIO;
  const overlaps: AliasOverlap[] = [];

  for (const charge of candidate) {
    let nearest: { dateKey: string; gapDays: number } | null = null;
    for (const other of existing) {
      const gapDays = Math.abs(daysBetweenKeys(other.dateKey, charge.dateKey));
      if (nearest === null || gapDays < nearest.gapDays) {
        nearest = { dateKey: other.dateKey, gapDays };
      }
    }
    if (nearest === null || nearest.gapDays >= limit) continue;
    overlaps.push({
      existingKey: nearest.dateKey,
      candidateKey: charge.dateKey,
      gapDays: nearest.gapDays,
    });
  }

  return overlaps.sort((left, right) =>
    left.candidateKey.localeCompare(right.candidateKey),
  );
}

/**
 * How late a charge may be before its absence means something.
 *
 * Proportional with a floor: a monthly bill needs a few days for weekend drift, and a yearly
 * one drifts by more than five days without anything being wrong.
 */
function graceDays(cadence: Cadence): number {
  return Math.max(5, Math.ceil(cadenceDaysApprox(cadence) * 0.1));
}

/**
 * Active scheduled bills whose next charge is overdue with nothing posted.
 *
 * **Flags, never applies** — the founding rule of every declaration in this module
 * (`agent-os/specs/2026-08-14-1012-recurring-bill-cadences/`). A bill with no charge on file at
 * all is skipped rather than reported: with no anchor there is no due date, and "overdue" built
 * on a date nobody observed is a guess wearing a fact's clothes.
 */
export function staleSubscriptions(
  bills: readonly StoredBillRow[],
  charges: ReadonlyMap<string, readonly CommitmentCharge[]>,
  todayKey: string,
): StaleSubscription[] {
  const stale: StaleSubscription[] = [];

  for (const bill of bills) {
    if (bill.status !== "active" || !bill.scheduled) continue;

    const mine = (charges.get(bill.name) ?? []).filter(
      (charge) => charge.dateKey <= todayKey,
    );
    const lastCharge =
      mine.length > 0
        ? mine.reduce(
            (latest, charge) => (charge.dateKey > latest ? charge.dateKey : latest),
            mine[0].dateKey,
          )
        : null;
    // `billAnchor` is what decides whether a declared future date is the charge being waited
    // for or the one already had — the rule that stopped 1Password's 2027 anchor from
    // flagging 2026-03-30 as missing, and it now lives in one place.
    const { expectedKey } = billAnchor(bill, lastCharge, todayKey);
    if (expectedKey === null) continue;

    const overdueDays = daysBetweenKeys(expectedKey, todayKey);
    if (overdueDays <= graceDays(cadenceOf(bill))) continue;

    stale.push({
      billId: bill.id,
      name: bill.name,
      expectedOn: expectedKey,
      expectedCents: bill.expectedCents,
      overdueDays,
    });
  }

  return stale.sort((left, right) => right.overdueDays - left.overdueDays);
}

// — Twelve-month forward view ————————————————————————————————————————————————

export type ForwardItem = {
  name: string;
  cents: number;
  /** False for unscheduled bills and tier 2 rates — they contribute money, not a date. */
  dated: boolean;
  dateKey: string | null;
};

export type ForwardBucket = {
  key: string;
  label: string;
  startKey: string;
  endKey: string;
  items: ForwardItem[];
  totalCents: number;
  /** True when this bucket is strictly above the 12-bucket median. */
  aboveMedian: boolean;
};

export type SpendRateInput = {
  entry: StoredSpend;
  ratePerPeriodCents: number;
};

const FORWARD_MONTHS = 12;

function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function monthStart(monthKey: string): string {
  return `${monthKey}-01`;
}

function monthEnd(monthKey: string): string {
  return shiftDateKey(shiftDateKeyMonths(monthStart(monthKey), 1), -1);
}

function markAboveMedian(buckets: ForwardBucket[]): ForwardBucket[] {
  const totals = buckets
    .map((bucket) => bucket.totalCents)
    .sort((left, right) => left - right);
  const medianCents =
    totals.length === 0
      ? 0
      : totals.length % 2 === 1
        ? totals[Math.floor(totals.length / 2)]
        : Math.round((totals[totals.length / 2 - 1] + totals[totals.length / 2]) / 2);
  return buckets.map((bucket) => ({
    ...bucket,
    aboveMedian: bucket.totalCents > medianCents,
  }));
}

function finishBucket(
  key: string,
  label: string,
  startKey: string,
  endKey: string,
  items: ForwardItem[],
): ForwardBucket {
  return {
    key,
    label,
    startKey,
    endKey,
    items: items.sort(
      (left, right) =>
        (left.dateKey ?? "").localeCompare(right.dateKey ?? "") ||
        left.name.localeCompare(right.name),
    ),
    totalCents: items.reduce((total, item) => total + item.cents, 0),
    aboveMedian: false,
  };
}

function monthlySpendCents(input: SpendRateInput): number {
  if (!input.entry.active || input.ratePerPeriodCents <= 0) return 0;
  return input.entry.period === "week"
    ? Math.round((input.ratePerPeriodCents * 52) / 12)
    : input.ratePerPeriodCents;
}

function billOccurrences(
  bill: StoredBillRow,
  charges: readonly CommitmentCharge[],
  todayKey: string,
  horizonKey: string,
): string[] {
  if (bill.status !== "active" || !bill.scheduled) return [];
  const lastPosted =
    charges.length > 0
      ? charges.reduce(
          (latest, charge) => (charge.dateKey > latest ? charge.dateKey : latest),
          charges[0].dateKey,
        )
      : null;
  const lastCharge =
    bill.anchorDate !== null && (lastPosted === null || bill.anchorDate > lastPosted)
      ? shiftDateKeyMonths(bill.anchorDate, -bill.cadenceMonths)
      : lastPosted;
  if (lastCharge === null) return [];
  const dates: string[] = [];
  let due = nextDueFrom(lastCharge, cadenceOf(bill), todayKey);
  // 24 months of cadences is the same bound `nextDueFrom` uses.
  for (let step = 0; step < 24 && due < horizonKey; step++) {
    if (due >= todayKey) dates.push(due);
    due = shiftDateKeyMonths(due, bill.cadenceMonths);
  }
  return dates;
}

/**
 * Every active commitment projected across the next twelve calendar months.
 *
 * Dated tier 1 charges land on the month they are due. Unscheduled bills and tier 2 rates
 * contribute their monthly cost with **no date** — a projected date on propane or pizza
 * would read as knowledge. Months strictly above the 12-month median are marked so an
 * annual charge is visible months out.
 */
export function projectForwardMonths(
  bills: readonly StoredBillRow[],
  spend: readonly SpendRateInput[],
  chargesByName: ReadonlyMap<string, readonly CommitmentCharge[]>,
  todayKey: string,
): ForwardBucket[] {
  const horizonKey = shiftDateKeyMonths(todayKey, FORWARD_MONTHS);
  const byMonth = new Map<string, ForwardItem[]>();
  for (let step = 0; step < FORWARD_MONTHS; step++) {
    const key = monthKeyOf(shiftDateKeyMonths(`${todayKey.slice(0, 7)}-01`, step));
    byMonth.set(key, []);
  }

  for (const bill of bills) {
    if (bill.status !== "active") continue;
    const amount = bill.expectedCents;
    if (amount === null || amount <= 0) continue;

    if (!bill.scheduled) {
      const monthly = Math.round(annualCents(amount, cadenceOf(bill)) / 12);
      for (const items of byMonth.values()) {
        items.push({ name: bill.name, cents: monthly, dated: false, dateKey: null });
      }
      continue;
    }

    for (const dateKey of billOccurrences(
      bill,
      chargesByName.get(bill.name) ?? [],
      todayKey,
      horizonKey,
    )) {
      const items = byMonth.get(monthKeyOf(dateKey));
      if (items) items.push({ name: bill.name, cents: amount, dated: true, dateKey });
    }
  }

  for (const input of spend) {
    const monthly = monthlySpendCents(input);
    if (monthly <= 0) continue;
    for (const items of byMonth.values()) {
      items.push({
        name: input.entry.name,
        cents: monthly,
        dated: false,
        dateKey: null,
      });
    }
  }

  const buckets = [...byMonth.entries()].map(([key, items]) =>
    finishBucket(key, key, monthStart(key), monthEnd(key), items),
  );
  return markAboveMedian(buckets);
}

/**
 * The same projection, grouped by pay period instead of calendar month.
 *
 * Walks detected (or supplied) payday dates forward 12 months. Unscheduled and tier 2
 * costs are spread evenly across the periods they cover, not given a date.
 */
export function projectForwardPayPeriods(
  bills: readonly StoredBillRow[],
  spend: readonly SpendRateInput[],
  chargesByName: ReadonlyMap<string, readonly CommitmentCharge[]>,
  todayKey: string,
  paydays: readonly Payday[],
): ForwardBucket[] {
  if (paydays.length === 0) return [];

  const sorted = [...paydays].map((payday) => payday.dateKey).sort();
  const gaps: number[] = [];
  for (let index = 1; index < sorted.length; index++) {
    const gap = daysBetweenKeys(sorted[index - 1], sorted[index]);
    if (gap > 0) gaps.push(gap);
  }
  const cadenceDays =
    gaps.length === 0
      ? 14
      : gaps.length % 2 === 1
        ? gaps[Math.floor(gaps.length / 2)]
        : Math.round(
            (gaps[Math.floor(gaps.length / 2) - 1] +
              gaps[Math.floor(gaps.length / 2)]) /
              2,
          );

  const horizonKey = shiftDateKeyMonths(todayKey, FORWARD_MONTHS);
  let cursor = sorted[sorted.length - 1];
  while (cursor > todayKey) {
    cursor = shiftDateKey(cursor, -cadenceDays);
  }
  const starts: string[] = [];
  for (let step = 0; step < 40 && cursor < horizonKey; step++) {
    if (shiftDateKey(cursor, cadenceDays) > todayKey) starts.push(cursor);
    cursor = shiftDateKey(cursor, cadenceDays);
  }

  const buckets: Omit<ForwardBucket, "aboveMedian">[] = starts.map((startKey) => {
    const endKey = shiftDateKey(startKey, cadenceDays - 1);
    return {
      key: startKey,
      label: `${startKey} – ${endKey}`,
      startKey,
      endKey,
      items: [] as ForwardItem[],
      totalCents: 0,
    };
  });

  for (const bill of bills) {
    if (bill.status !== "active") continue;
    const amount = bill.expectedCents;
    if (amount === null || amount <= 0) continue;

    if (!bill.scheduled) {
      const perPeriod = Math.round(
        (annualCents(amount, cadenceOf(bill)) * cadenceDays) / 365,
      );
      for (const bucket of buckets) {
        bucket.items.push({
          name: bill.name,
          cents: perPeriod,
          dated: false,
          dateKey: null,
        });
      }
      continue;
    }

    for (const dateKey of billOccurrences(
      bill,
      chargesByName.get(bill.name) ?? [],
      todayKey,
      horizonKey,
    )) {
      const bucket = buckets.find(
        (entry) => dateKey >= entry.startKey && dateKey <= entry.endKey,
      );
      if (bucket) {
        bucket.items.push({ name: bill.name, cents: amount, dated: true, dateKey });
      }
    }
  }

  for (const input of spend) {
    if (!input.entry.active || input.ratePerPeriodCents <= 0) continue;
    const perPeriod =
      input.entry.period === "week"
        ? Math.round((input.ratePerPeriodCents * cadenceDays) / 7)
        : Math.round((input.ratePerPeriodCents * 12 * cadenceDays) / 365);
    if (perPeriod <= 0) continue;
    for (const bucket of buckets) {
      bucket.items.push({
        name: input.entry.name,
        cents: perPeriod,
        dated: false,
        dateKey: null,
      });
    }
  }

  return markAboveMedian(
    buckets.map((bucket) =>
      finishBucket(
        bucket.key,
        bucket.label,
        bucket.startKey,
        bucket.endKey,
        bucket.items,
      ),
    ),
  );
}

/** Detected merchants not yet claimed by either table — the Commitments create list. */
/**
 * A first guess at what to call a commitment, from the bank's string.
 *
 * Prefills an editable field and nothing more, so a mediocre guess costs a keystroke. It exists
 * because the review list used to write the raw merchant as the name with no chance to change
 * it, and the bank's spelling is a poor name twice over: it carries the store number of one
 * branch, and it names one shop where the commitment is usually a group of them.
 *
 * Store numbers go, all-caps runs get title case, and mixed-case strings are left alone on the
 * grounds that whoever wrote "Comcast / Xfinity" already did this job. `1PASSWORDTORONTOON`
 * becomes `1Passwordtorontoon`, which is not right either — no rule recovers "1Password" from
 * that, and pretending otherwise would mean a dictionary. It is still easier to correct than to
 * retype.
 */
export function suggestCommitmentName(merchant: string): string {
  const withoutStoreNumber = merchant
    .replace(/\s*#\s*\d+\s*$/, "")
    .replace(/\s+\d{2,}\s*$/, "")
    .trim();
  const base = withoutStoreNumber === "" ? merchant.trim() : withoutStoreNumber;

  return base
    .split(/\s+/)
    .map((word) =>
      // Only shout-case words are rewritten. A word with any lowercase in it was typed by
      // someone rather than by a payment terminal.
      /[a-z]/.test(word)
        ? word
        : word.replace(
            /^([^A-Za-z]*)([A-Za-z])(.*)$/,
            (_, lead, first, rest) =>
              `${lead}${first.toUpperCase()}${rest.toLowerCase()}`,
          ),
    )
    .join(" ");
}

export function unclaimedMerchants(
  detected: readonly string[],
  bills: readonly StoredBillRow[],
  spend: readonly StoredSpend[],
): string[] {
  const claimed = matcherIndex(bills, spend);
  return [...new Set(detected)]
    .filter((merchant) => merchant !== "" && !claimed.has(merchant))
    .sort((left, right) => left.localeCompare(right));
}
