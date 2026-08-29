/**
 * Counting a cadence's anchor dates inside one month, and measuring the distance to a future
 * anchor. Nothing here knows what a target *asks* — `demand.ts` owns that.
 *
 * **Today does not enter a count.** A period cap is the whole month's anchors from the day the
 * target started (`since`), and a bill is counted against the charge it is waiting for, not
 * against the calendar. `remainingOccurrences` used to trim the cap as anchors passed; that was
 * the same mistake as putting Activity in the basis, one function over
 * (`target-refill-basis` D2).
 *
 * **No `Date` loop and no process-local clock.** Weekday counts are closed form from the
 * weekday of the 1st and the month's length. The weekday of the 1st comes from
 * `weekdayOfDateKey`, which reads the UTC-noon encoding — `new Date(key).getDay()` reports
 * Saturday evening for a Sunday in the Americas (`standards/development/dates.md`).
 *
 * Spec: `agent-os/specs/2026-08-28-1000-ynab-target-engine/` D3, as superseded by
 * `agent-os/specs/2026-08-28-2039-target-refill-basis/` D1, D2.
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

/**
 * Anchor dates inside `month` — the month's whole cap, ignoring today.
 *
 * The cap answers **what this envelope's month costs**, not what it costs from today, and not
 * what it costs from the day the target was written down. It does not shrink as Fridays pass:
 * a week that has already happened was still a week the target asked for, and the money
 * assigned for it is what paid for it.
 *
 * `since` is therefore a **month guard, not a day filter**. A month entirely before the target
 * asks nothing; the month the target started in asks its whole cap, past anchors included
 * (`target-refill-basis` D2, as corrected by `target-since-month-granularity` D1). Trimming
 * inside the start month was what called Groceries funded on 2026-08-28 with $158.06 available
 * against a $210.96 shop still to come: the backfilled `since` was the day the budget was
 * created, so August asked for one Sunday while a whole month of assignment and spending sat
 * against it. Nothing is over-asked by counting whole — Assigned counts toward the cap, so a
 * target adopted mid-month asks only for what its month is still short of.
 */
export function wholeOccurrences(
  cadence: Cadence,
  month: MonthKey,
  bill?: ScheduleBill,
  since?: string,
): number {
  if (since && monthKeyOf(since) > month) return 0;
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
 * Charges of `bill` inside `month` that are still outstanding.
 *
 * A **month cadence** is tied to the one charge being waited for, so a later month's charge is
 * a later cycle and asks nothing here — that is `month-ahead-zero-based` D1's "full amount in
 * the due month, $0 in every other", which this spec does not supersede. A **day cadence**
 * (weekly, biweekly, 28-day) charges in every month, so it sums whatever the month still holds.
 */
export function outstandingCharges(bill: ScheduleBill, month: MonthKey): number {
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
