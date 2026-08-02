/**
 * Calendar arithmetic on `Date`, in **local wall-clock time**.
 *
 * Every function here goes through the local getters and setters rather than adding
 * milliseconds, which is what makes "same time, N days later" survive a daylight saving
 * boundary: 09:00 the day after a spring-forward is still 09:00, not 10:00. Adding
 * `n * 86_400_000` would be simpler and wrong twice a year.
 *
 * Shared by appointment recurrence (`src/lib/schedule/recurrence.ts`) and task recurrence
 * (`src/lib/recurrence/nextDue.ts`). They are unrelated features that happen to need the
 * same clamping rules; keeping one copy is what stops the two from drifting apart.
 *
 * Day *keys* (`YYYY-MM-DD`) live in `geometry.ts` (`toDateKey` / `fromDateKey` /
 * `daysBetweenKeys`). See `agent-os/standards/development/dates.md`.
 */

/**
 * Local midnight on the same **process-local** calendar day.
 *
 * Use for wall-clock appointment math and intermediate arithmetic. **Do not** use this to
 * stamp plan/record calendar fields — that is `asCalendarDay` / `fromDateKey` (UTC noon).
 * Server `startOfDay` on a client local-midnight stamp is how Aug 1 became Jul 31.
 */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Whole calendar days from `from` to `to`, ignoring the time of day. Negative if earlier. */
export function daysBetween(from: Date, to: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const a = startOfDay(from);
  const b = startOfDay(to);
  // Round, because a DST boundary inside the span makes the raw difference 23 or 25 hours.
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** Days in a month. `month` is 1–12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Add months, clamping to the end of a short target month rather than overflowing into the
 * next one — Jan 31 + 1 month is Feb 28 (or Feb 29), not Mar 3.
 *
 * `setMonth` overflows on its own, so the clamp is detected after the fact: if the day of
 * the month changed, we landed in the following month and `setDate(0)` steps back to the
 * last day of the intended one.
 */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) {
    d.setDate(0);
  }
  return d;
}

/** Add years, inheriting the month clamp — so Feb 29 lands on Feb 28 in a common year. */
export function addYears(date: Date, years: number): Date {
  return addMonths(date, years * 12);
}
