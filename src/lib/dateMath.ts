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
 */

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
