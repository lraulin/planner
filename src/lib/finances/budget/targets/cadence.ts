/**
 * Counting a cadence's anchor dates inside one month, and measuring the distance to a future
 * anchor. Nothing here knows what a target *asks* — `demand.ts` owns that — so the two claims
 * this spec is built on ("remaining occurrences, not whole ones" and "measured against
 * Available") can be tested one at a time.
 *
 * **No `Date` loop and no process-local clock.** Weekday counts are closed form from the
 * weekday of the 1st and the month's length; `todayKey` arrives as a parameter. The weekday of
 * the 1st comes from `weekdayOfDateKey`, which reads the UTC-noon encoding —
 * `new Date(key).getDay()` reports Saturday evening for a Sunday in the Americas
 * (`standards/development/dates.md`).
 *
 * Spec: `agent-os/specs/2026-08-28-1000-ynab-target-engine/` D3.
 */

import { cadenceOf, shiftDateKeyMonths } from "@/lib/finances/recurringBills";
import {
  daysBetweenKeys,
  shiftDateKey,
  weekdayOfDateKey,
} from "@/lib/schedule/geometry";
import { monthEndKey, monthKeyOf, nextMonthKey, type MonthKey } from "../envelope";
import { monthsBetween, monthsUntilDate } from "../templates/monthSpan";
import type { Cadence } from "./types";

/**
 * What the `schedule` cadence resolves against — a bill envelope's own recurrence.
 *
 * `expectedKey` is the charge **being waited for** and may be in the past: that is what overdue
 * means (`commitments.ts`). Counting from it rather than from `nextDueKey` is what keeps a late
 * bill asking instead of falling silent the day after its due date, and what makes a *paid*
 * bill stop asking — paying advances the last posted charge, which advances `expectedKey`.
 */
export type ScheduleBill = {
  cadenceMonths: number;
  cadenceDays: number | null;
  /** The next charge at or after today. */
  nextDueKey: string;
  /** The charge being waited for; falls back to `nextDueKey` when nothing is outstanding. */
  expectedKey?: string | null;
};

/** Bounded so a stale anchor with a short cadence cannot iterate for as long as history is deep. */
const MAX_STEPS = 400;
/** No cadence this app offers fires more than 31 times in a month. */
const MAX_IN_MONTH = 40;

function daysInMonthOf(month: MonthKey): number {
  return Number(monthEndKey(month).slice(8, 10));
}

function scheduleAnchor(bill: ScheduleBill): string {
  return bill.expectedKey ?? bill.nextDueKey;
}

/**
 * Whether a bill's cadence **sinks** rather than firing inside the month. Quarterly and yearly
 * bills are saved toward across the months before the charge; every day cadence this app offers
 * (weekly, biweekly, 28-day) and a plain monthly bill land inside the month they are counted in.
 */
export function scheduleSpreads(bill: ScheduleBill): boolean {
  const cadence = cadenceOf(bill);
  return cadence.unit === "month" && cadence.n > 1;
}

/**
 * Every charge date of `bill` that falls inside `month`, anchored on the outstanding charge.
 *
 * Carried over from `templates/schedule.ts`'s `occurrencesInMonth`, generalised from day
 * cadences to any cadence via `shiftByCadence`. Walks backward to before the month, then
 * forward through it — bounded by the cadence, never by a fixed step count.
 */
export function occurrenceDatesInMonth(bill: ScheduleBill, month: MonthKey): string[] {
  const cadence = cadenceOf(bill);
  const anchor = scheduleAnchor(bill);
  const monthEnd = nextMonthKey(month);

  /** The k-th charge, always measured from the anchor so month clamping cannot accumulate. */
  const at = (k: number) =>
    cadence.unit === "day"
      ? shiftDateKey(anchor, k * cadence.n)
      : shiftDateKeyMonths(anchor, k * cadence.n);

  let k =
    cadence.unit === "day"
      ? Math.ceil(daysBetweenKeys(anchor, month) / cadence.n)
      : Math.ceil(monthsBetween(monthKeyOf(anchor), month) / cadence.n);
  // The estimate is off by at most one step (day clamping, a partial month), so settle it.
  let steps = 0;
  while (steps < MAX_STEPS && at(k - 1) >= month) {
    k -= 1;
    steps += 1;
  }
  while (steps < MAX_STEPS && at(k) < month) {
    k += 1;
    steps += 1;
  }

  const dates: string[] = [];
  while (dates.length < MAX_IN_MONTH && at(k) < monthEnd) {
    dates.push(at(k));
    k += 1;
  }
  return dates;
}

/**
 * How many times `weekday` (0 = Sunday) falls inside the calendar month.
 *
 * Moved unchanged from `templates/weekly.ts`.
 */
export function countWeekdayInMonth(month: MonthKey, weekday: number): number {
  const firstWeekday = weekdayOfDateKey(month);
  const days = daysInMonthOf(month);
  /** Days from the 1st to the month's first matching weekday. */
  const offset = (weekday - firstWeekday + 7) % 7;
  if (offset >= days) return 0;
  return Math.floor((days - 1 - offset) / 7) + 1;
}

/** The same count, restricted to dates on or after day `fromDay` of the month. Closed form. */
function countWeekdayFromDay(
  month: MonthKey,
  weekday: number,
  fromDay: number,
): number {
  const total = countWeekdayInMonth(month, weekday);
  if (total === 0) return 0;
  const firstWeekday = weekdayOfDateKey(month);
  const offset = (weekday - firstWeekday + 7) % 7;
  const skipped = Math.max(0, Math.ceil((fromDay - 1 - offset) / 7));
  return Math.max(0, total - skipped);
}

/** A `month` cadence's anchor date, clamped into a month too short to hold it. */
export function monthAnchorDay(month: MonthKey, day: number): number {
  return Math.min(day, daysInMonthOf(month));
}

/**
 * Anchor dates inside `month`, ignoring today.
 *
 * This is what an `add` line counts: a contribution is not coverage of trips, so skipping a
 * week does not make the month cheaper (`weekly-envelope-targets` D2, whose argument survives
 * exactly where it still holds).
 */
export function wholeOccurrences(
  cadence: Cadence,
  month: MonthKey,
  bill?: ScheduleBill,
): number {
  switch (cadence.unit) {
    case "week":
      return countWeekdayInMonth(month, cadence.weekday);
    case "month":
      return 1;
    case "schedule":
      return bill ? occurrenceDatesInMonth(bill, month).length : 0;
    default:
      return 0;
  }
}

/**
 * Anchor dates inside `month` that are still **on or after `todayKey`**.
 *
 * A wholly future month therefore counts all of them and a wholly past month counts none — a
 * weekly target asks nothing for a month that has already happened. Today's own occurrence
 * counts: the money is needed today.
 */
export function remainingOccurrences(
  cadence: Cadence,
  month: MonthKey,
  todayKey: string,
  bill?: ScheduleBill,
): number {
  // A bill is counted against the charge it is **waiting for**, not against the calendar: an
  // overdue charge is anchored before today and still counts, and a paid one has already
  // moved `expectedKey` on. That is the whole difference between "late" and "settled".
  if (cadence.unit === "schedule") return bill ? outstandingCharges(bill, month) : 0;

  const todayMonth = monthKeyOf(todayKey);
  if (month > todayMonth) return wholeOccurrences(cadence, month, bill);
  if (month < todayMonth) return 0;
  const today = Number(todayKey.slice(8, 10));
  switch (cadence.unit) {
    case "week":
      return countWeekdayFromDay(month, cadence.weekday, today);
    case "month":
      return monthAnchorDay(month, cadence.day) >= today ? 1 : 0;
    default:
      return 0;
  }
}

/**
 * Charges of `bill` inside `month` that are still outstanding.
 *
 * A **month cadence** is tied to the one charge being waited for, so a later month's charge is
 * a later cycle and asks nothing here — that is `month-ahead-zero-based` D1's "full amount in
 * the due month, $0 in every other", which this spec does not supersede. A **day cadence**
 * (weekly, biweekly, 28-day) charges in every month, so it sums whatever the month still holds.
 */
function outstandingCharges(bill: ScheduleBill, month: MonthKey): number {
  const anchor = scheduleAnchor(bill);
  if (cadenceOf(bill).unit === "month") return monthKeyOf(anchor) === month ? 1 : 0;
  return occurrenceDatesInMonth(bill, month).filter((date) => date >= anchor).length;
}

/**
 * Whole months from `month` to the cadence's anchor, for the spread behaviours.
 *
 * `null` means **never** — an infinite horizon, which only `none` has. Zero means the anchor is
 * this month, so the whole remaining hole is asked for at once; a `by` deadline that has passed
 * returns zero for the same reason, which is what makes `balance` floor rather than repeat.
 * `year` walks forward a year once its anchor month has passed, because it repeats.
 */
export function monthsLeft(
  cadence: Cadence,
  month: MonthKey,
  bill?: ScheduleBill,
): number | null {
  switch (cadence.unit) {
    case "year": {
      const year = Number(month.slice(0, 4));
      const anchor = (y: number) => `${y}-${String(cadence.month).padStart(2, "0")}-01`;
      const thisYear = monthsBetween(month, anchor(year));
      return thisYear >= 0 ? thisYear : monthsBetween(month, anchor(year + 1));
    }
    case "by":
      return Math.max(0, monthsBetween(month, `${cadence.month}-01`));
    case "none":
      return null;
    case "schedule":
      return bill ? Math.max(0, monthsUntilDate(month, scheduleAnchor(bill))) : 0;
    default:
      return 0;
  }
}
