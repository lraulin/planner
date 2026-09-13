/**
 * The date a repeating task's pattern is *about*.
 *
 * One copy, because two callers must agree on it: completing or skipping the task
 * (`applyStateTransition` / `skipRecurrence` in `src/lib/tree/mutations.ts`) steps the dates
 * on from here, and the drawer's "Next" preview (`RecurrenceFields`) promises to show what
 * that step will produce. When the preview kept its own precedence it read an expired
 * deferred date that completing ignores, so it could name a date years from the real one.
 *
 * Pure — `asOfDay` is a `YYYY-MM-DD` key supplied by the caller.
 */

import { toDateKey } from "@/lib/schedule/geometry";

export type AnchorDates = {
  deadline: Date | null;
  deferredDate: Date | null;
  targetStartDate: Date | null;
};

/**
 * The deadline if there is one, else a *still-holding* deferred date, else the target start.
 *
 * A deadline is the date a repeating task is named for — "the report is due every Friday"
 * means Friday is the deadline, not the day you start. Only when there is no deadline does
 * the defer date take over as the thing the schedule moves.
 *
 * An **expired** deferred date — on or before `asOfDay` — is shelf residue (expiry is
 * derived, never swept) and must not be the shift origin. Using it turned "complete the
 * routine that came back today" into a multi-year jump of every other date — target start
 * leapt to 2033 from a 2020 residue in one case. Fall through to target start, or to null so
 * the caller can stand on the completion day.
 */
export function recurrenceAnchor(dates: AnchorDates, asOfDay: string): Date | null {
  if (dates.deadline) return dates.deadline;
  if (dates.deferredDate && toDateKey(dates.deferredDate) > asOfDay) {
    return dates.deferredDate;
  }
  return dates.targetStartDate;
}
