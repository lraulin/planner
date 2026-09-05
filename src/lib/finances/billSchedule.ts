/**
 * A bill's **declared** occurrence series — the calendar it is contractually on, as distinct
 * from the dates its charges happened to post.
 *
 * **Why this exists.** `billAnchor` used to derive the next expected charge as *last posted
 * charge + one cadence*. That is a random walk: every deviation is absorbed permanently
 * instead of correcting. Rent is due the 1st and autopays seven days ahead, so its postings
 * land anywhere from the 17th to the 31st; replayed over 24 real cycles, the walk falsely
 * flagged 16 of them as never having arrived. A calendar series measured from a fixed seed is
 * self-correcting in the way the walk was assumed to be
 * (`agent-os/specs/2026-09-05-1401-bill-due-dates-and-lead-time/` D1).
 *
 * **Two dates, not one.** `dueKey` is the contract — the day the landlady expects the money.
 * `expectedKey` is the cash flow — `dueKey − leadDays`, when autopay actually fires and what
 * the bank posts against. The envelope funds the posting; the due date is information.
 *
 * **Every occurrence is measured from the seed**, never stepped from the previous one, so a
 * due day of the 31st cannot degrade to the 28th by walking through February — the same
 * technique `occurrenceDatesInMonth` uses (`budget/targets/cadence.ts`).
 *
 * **A charge is matched to its nearest occurrence**, not turned into the next anchor. The
 * cadence defines the buckets, so there is no tolerance constant to tune and get wrong, and
 * it answers a question the app could not previously answer at all: *which month's rent did
 * this charge pay?*
 *
 * Pure, `YYYY-MM-DD` keys throughout, no `Date` for calendar arithmetic
 * (`agent-os/standards/development/dates.md`).
 */

import { daysBetweenKeys, shiftDateKey } from "@/lib/schedule/geometry";
import { cadenceOf, shiftDateKeyMonths, type Cadence } from "./recurringBills";

/** What `declaresSchedule` needs to answer, and what a series is built from. */
export type SchedulableBill = {
  cadenceMonths: number;
  cadenceDays?: number | null;
  dueDay: number | null;
  leadDays: number;
  scheduled: boolean;
};

/**
 * A bill's occurrence series, resolved to a concrete seed.
 *
 * The seed cannot live on the bill row: it is a *phase*, and for a monthly bill there is no
 * phase to store — every month has an occurrence. It only matters for a cadence longer than a
 * month, where it says which months are in the series, and there it is read off the bill's
 * own history rather than being a second thing the user has to declare.
 */
export type BillSeries = {
  /** `YYYY-MM` of occurrence 0. Every other occurrence's month is measured from this. */
  seedMonthKey: string;
  /** Day of the month the bill is due, 1–31, clamped into each short month it lands in. */
  dueDay: number;
  /** Whole calendar months between occurrences. Always ≥ 1; day cadences have no series. */
  cadenceMonths: number;
  /** Days before the due date the charge posts. */
  leadDays: number;
};

/** One occurrence of a declared bill: what is owed, when, and when it will post. */
export type Occurrence = {
  /** Steps from the seed. Negative for occurrences before it; only ordering matters. */
  index: number;
  /** The contractual due date. */
  dueKey: string;
  /** When the charge is expected to post — `dueKey` less the lead. */
  expectedKey: string;
};

/**
 * Whether a bill states a calendar schedule, as opposed to being walked from its last charge.
 *
 * All three conditions are load-bearing. A **day** cadence genuinely is a walk — Vetsource
 * ships every 28 days and the day of the month marches backwards — so a due day would be a
 * lie about it. An **unscheduled** bill (propane) has a knowable cost and an unknowable date
 * by definition. And a null `dueDay` is the existing behavior every bill still has until the
 * user declares otherwise: no backfill, no inference from postings.
 */
export function declaresSchedule(bill: SchedulableBill): boolean {
  return bill.dueDay !== null && bill.scheduled && cadenceOf(bill).unit === "month";
}

/**
 * The due date inside calendar month `monthKey` (`YYYY-MM`), clamped into a short month.
 *
 * A rent due on the 31st is a real thing and February is not a reason to reject it; the
 * clamp is the same one `shiftDateKeyMonths` applies, stated here because a due date is
 * built from a day number rather than shifted from another key.
 */
function dueInMonth(monthKey: string, dueDay: number): string {
  const first = `${monthKey}-01`;
  const days = daysBetweenKeys(first, shiftDateKeyMonths(first, 1));
  return `${monthKey}-${String(Math.min(dueDay, days)).padStart(2, "0")}`;
}

/** The month `dateKey` falls in, shifted by whole months. */
function shiftMonthKey(monthKey: string, months: number): string {
  return shiftDateKeyMonths(`${monthKey}-01`, months).slice(0, 7);
}

/**
 * The series `bill` declares, phased against a date from its own history, or null if it
 * declares none.
 *
 * `phaseRefKey` should be the bill's `anchorDate` when it has one, else its last posted
 * charge, else today — the same precedence `billAnchor` already applies. It is read as a
 * *posting* date, so the due date it implies is `phaseRefKey + leadDays`; the seed is then
 * the nearest due day to that, which keeps a posting that drifted across a month boundary
 * from phasing a semi-annual bill into the wrong half of the year.
 */
export function declaredSeries(
  bill: SchedulableBill,
  phaseRefKey: string,
): BillSeries | null {
  if (!declaresSchedule(bill) || bill.dueDay === null) return null;

  const dueDay = bill.dueDay;
  const impliedDue = shiftDateKey(phaseRefKey, bill.leadDays);
  const seedMonthKey = [-1, 0, 1]
    .map((months) => shiftMonthKey(impliedDue.slice(0, 7), months))
    .reduce((best, candidate) =>
      Math.abs(daysBetweenKeys(dueInMonth(candidate, dueDay), impliedDue)) <
      Math.abs(daysBetweenKeys(dueInMonth(best, dueDay), impliedDue))
        ? candidate
        : best,
    );

  return {
    seedMonthKey,
    dueDay,
    cadenceMonths: bill.cadenceMonths,
    leadDays: bill.leadDays,
  };
}

/**
 * The k-th occurrence.
 *
 * The **month** is shifted from the seed and the due day is applied fresh, rather than the
 * date being stepped from the previous occurrence. Stepping is what lets a 31st degrade to
 * the 28th on the way through February and stay there.
 */
export function occurrenceAt(series: BillSeries, index: number): Occurrence {
  const monthKey = shiftMonthKey(series.seedMonthKey, index * series.cadenceMonths);
  const dueKey = dueInMonth(monthKey, series.dueDay);
  return { index, dueKey, expectedKey: shiftDateKey(dueKey, -series.leadDays) };
}

/** How far the estimate below may be off before the series is being asked a silly question. */
const MAX_SETTLE_STEPS = 8;

/**
 * The occurrence a charge posted on `dateKey` belongs to — the one whose expected posting
 * date it is nearest.
 *
 * Nearest, not "the next one after": a charge that arrives four days early is that
 * occurrence's charge, and calling it the previous one's late payment is exactly the error
 * the walk made. Ties go to the earlier occurrence, which is the one already owed.
 */
export function nearestOccurrence(series: BillSeries, dateKey: string): Occurrence {
  const seedExpected = occurrenceAt(series, 0).expectedKey;
  const monthsOut =
    (Number(dateKey.slice(0, 4)) - Number(seedExpected.slice(0, 4))) * 12 +
    (Number(dateKey.slice(5, 7)) - Number(seedExpected.slice(5, 7)));
  let best = occurrenceAt(series, Math.round(monthsOut / series.cadenceMonths));

  // The month estimate is off by at most one step (day clamping, a partial month), but walk
  // until it stops improving rather than assuming a direction.
  for (let step = 0; step < MAX_SETTLE_STEPS; step++) {
    const gap = Math.abs(daysBetweenKeys(best.expectedKey, dateKey));
    const forward = occurrenceAt(series, best.index + 1);
    const backward = occurrenceAt(series, best.index - 1);
    if (Math.abs(daysBetweenKeys(forward.expectedKey, dateKey)) < gap) {
      best = forward;
    } else if (Math.abs(daysBetweenKeys(backward.expectedKey, dateKey)) < gap) {
      best = backward;
    } else {
      return best;
    }
  }
  return best;
}

/** The occurrence after `occurrence` — the one still outstanding once it has been paid. */
export function nextOccurrenceAfter(
  series: BillSeries,
  occurrence: Occurrence,
): Occurrence {
  return occurrenceAt(series, occurrence.index + 1);
}

/** The first occurrence whose expected posting date is at or after `fromKey`. */
export function firstOccurrenceFrom(series: BillSeries, fromKey: string): Occurrence {
  const nearest = nearestOccurrence(series, fromKey);
  return nearest.expectedKey >= fromKey
    ? nearest
    : nextOccurrenceAfter(series, nearest);
}

/** Below this many charges the median is one number's opinion, not a pattern. */
const MIN_CHARGES_FOR_LEAD = 2;

/**
 * How many days ahead of the due date this bill's charges have actually been posting.
 *
 * **Suggested, never applied** — the founding rule of every declaration in this area
 * (`agent-os/specs/2026-08-14-1012-recurring-bill-cadences/`). The user has just typed a due
 * day; this offers the lead that fits their history and waits for them to confirm it.
 *
 * The median rather than the mean, because one charge posted a fortnight late by a bank
 * holiday should not move the answer at all. Negative offsets — a charge that posted *after*
 * its due date — clamp to zero: a lead is an autopay arrangement, and lateness is what grace
 * is for. Null when there is not enough history, or when the cadence is counted in days and
 * there is no due date for a charge to lead.
 */
export function suggestLeadDays(
  dueDay: number,
  chargeKeys: readonly string[],
  cadence: Cadence,
): number | null {
  if (cadence.unit === "day") return null;
  if (chargeKeys.length < MIN_CHARGES_FOR_LEAD) return null;

  const offsets = chargeKeys.map((chargeKey) => {
    // The due date this charge was nearest, looked for either side of its own month so an
    // early charge is measured against the due date it paid rather than the previous one.
    const nearestDue = [-1, 0, 1]
      .map((months) => dueInMonth(shiftMonthKey(chargeKey.slice(0, 7), months), dueDay))
      .reduce((best, candidate) =>
        Math.abs(daysBetweenKeys(candidate, chargeKey)) <
        Math.abs(daysBetweenKeys(best, chargeKey))
          ? candidate
          : best,
      );
    return daysBetweenKeys(chargeKey, nearestDue);
  });

  const sorted = [...offsets].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];

  return Math.max(0, Math.min(60, Math.round(median)));
}
