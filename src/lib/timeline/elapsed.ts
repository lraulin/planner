import { daysInMonth } from "@/lib/dateMath";
import { daysBetweenKeys } from "@/lib/schedule/geometry";

/**
 * How much time has passed since a date — the Timeline grid's two computed columns.
 *
 * Everything here works on `YYYY-MM-DD` **key components**, never on a `Date`. That is not
 * fussiness: `addMonths` / `addYears` in `dateMath.ts` are local wall-clock helpers, so
 * "how many years since 1998-06-01" computed through them would depend on the server's `TZ`,
 * which `development/dates.md` forbids of any business rule. Integer arithmetic on the key is
 * timezone-proof by construction, and it is what makes the month-end cases below testable.
 *
 * These are deliberately **not** the same as Agenda's `daysLeftOf` / `daysLeftTitle`. Those
 * answer "how soon" in prose ("In 3 days"); these answer "how long ago" as a number and a
 * duration. Sharing them would mean one helper with a mode flag.
 */

export type ElapsedParts = {
  years: number;
  months: number;
  days: number;
};

/** Whole days from `dateKey` to `todayKey`. Negative when the date has not happened yet. */
export function daysSince(dateKey: string, todayKey: string): number {
  return daysBetweenKeys(dateKey, todayKey);
}

/**
 * Break the span between two calendar days into years, months and days.
 *
 * **Returns `null` when `toKey` is before `fromKey`.** A date that has not happened has no
 * elapsed time, and the caller renders blank rather than a negative duration. Timeline is a
 * record of what happened; a future row is an edge case, not a countdown.
 *
 * Whole months are counted by **stepping from `fromKey`**, not by subtracting components. The
 * subtraction version needs a borrow when the day-of-month goes negative, and there is no
 * correct number to borrow: Jan 31 → Mar 1 borrows 29 days from February and still lands on
 * −1. Stepping asks the only question with an unambiguous answer — "how many times can I add a
 * month without overshooting?" — and measures the remainder in days.
 */
export function elapsedParts(fromKey: string, toKey: string): ElapsedParts | null {
  if (toKey < fromKey) return null;

  const from = parseKey(fromKey);
  const to = parseKey(toKey);

  let months = (to.year - from.year) * 12 + (to.month - from.month);
  // The component difference can overshoot by one when the day-of-month has not come round
  // yet — Jan 31 → Mar 1 looks like two months and is one.
  if (addMonthsToKey(fromKey, months) > toKey) months -= 1;

  const anchor = addMonthsToKey(fromKey, months);
  return {
    years: Math.floor(months / 12),
    months: months % 12,
    days: daysBetweenKeys(anchor, toKey),
  };
}

/**
 * `"24y 3m 11d"`, dropping units that lead with a zero — `"3m 11d"`, `"11d"`, `"0d"`.
 *
 * Leading zeros are dropped rather than all zeros: "1y 0m 4d" keeps its middle unit, because
 * removing it would read as "1y 4d" and invite the reader to add it up wrong.
 */
export function formatElapsed(parts: ElapsedParts): string {
  const units: string[] = [];
  if (parts.years > 0) units.push(`${parts.years}y`);
  if (units.length > 0 || parts.months > 0) units.push(`${parts.months}m`);
  units.push(`${parts.days}d`);
  return units.join(" ");
}

function parseKey(key: string): { year: number; month: number; day: number } {
  return {
    year: Number(key.slice(0, 4)),
    month: Number(key.slice(5, 7)),
    day: Number(key.slice(8, 10)),
  };
}

/**
 * Step a key by whole months, clamping the day to the target month's length so Jan 31 + 1
 * month is the end of February rather than rolling into March.
 */
function addMonthsToKey(key: string, months: number): string {
  const { year, month, day } = parseKey(key);
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return `${String(targetYear).padStart(4, "0")}-${pad(targetMonth)}-${pad(targetDay)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
