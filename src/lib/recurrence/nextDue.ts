/**
 * When a repeating task comes back, and whether it is back yet.
 *
 * Achieve's **regeneration-based** recurrence (manual §3.9.1) — "regenerate new item N
 * week(s) after each instance is completed" — with one deliberate divergence: it never
 * touches a deadline. A recurring task moves its **deferred date** and nothing else.
 *
 * That divergence is the whole feature. A deadline is an external constraint: taxes,
 * voting, a bill. "Play with the cats every day" and "change the pool filter roughly every
 * two weeks" are not deadlines — nothing breaks on day 18 — and filing them as deadlined
 * work fills Overdue with things that were never urgent. Once Overdue is mostly noise it
 * stops being read, and the one signal that means "this actually matters" is gone. So:
 * routines defer, they do not become due. See
 * `agent-os/specs/2026-07-31-0834-task-recurrence/`.
 *
 * Pure — no I/O, and no `new Date()`. The completion timestamp and today's date are both
 * arguments, the same contract `src/lib/tree/status.ts` and `src/lib/chooser/dates.ts`
 * already use, so every rule here is directly testable.
 */

import type { RecurrenceFrequency } from "@/db/schema";
import { addDays, addMonths, addYears } from "@/lib/dateMath";
import {
  asCalendarDay,
  fromDateKey,
  localDateKey,
  toDateKey,
} from "@/lib/schedule/geometry";

/**
 * The next deferred-until date for a task completed at `completedAt`, or null when the
 * task does not repeat.
 *
 * Measured from the completion, not from the previous due date. Finish a fortnightly chore
 * on day 18 and the next one is due 14 days from *then* — a routine you fell behind on
 * should not come back already late, because catching up on a backlog of chores you were
 * never going to do is the behaviour this feature exists to avoid.
 *
 * An interval below 1 floors to 1 rather than throwing: a zero interval would mean "due
 * again immediately", which is never what anyone meant, and a form that briefly holds an
 * empty number field should not be able to produce it.
 */
export function nextDue(
  completedAt: Date,
  frequency: RecurrenceFrequency,
  interval: number,
): Date | null {
  if (frequency === "none") return null;

  const n = Math.max(1, Math.floor(interval));
  // Completion is an **instant** (or a UTC-noon day from Date completed). Take its wall-clock
  // day, then store as UTC noon. `asCalendarDay`/`toDateKey` on a live instant is wrong after
  // evening in the Americas (UTC already tomorrow). See dates.md.
  const from = fromDateKey(localDateKey(completedAt));

  switch (frequency) {
    case "daily":
      return asCalendarDay(addDays(from, n));
    case "weekly":
      return asCalendarDay(addDays(from, n * 7));
    case "monthly":
      return asCalendarDay(addMonths(from, n));
    case "yearly":
      return asCalendarDay(addYears(from, n));
  }
}

/**
 * Whether a task is still waiting — its deferred date has not arrived yet.
 *
 * Compared as **calendar days**, not instants: a task deferred to today is available all
 * day, including at 09:00 when the stored timestamp says 17:00. That matches how
 * `scheduleStatus()` already decides "overdue", and it is the boundary most likely to be
 * got wrong, because the naive `deferredDate > new Date()` reads as correct and hides a
 * routine for most of the day it was due.
 *
 * `today` is `YYYY-MM-DD`, or null on the server before hydration — where nothing is
 * treated as deferred, so the server and client render the same rows.
 */
export function isDeferred(deferredDate: Date | null, today: string | null): boolean {
  if (!deferredDate || !today) return false;
  // Local calendar day — same key space as `toDateKey` / DateField / `useToday`. UTC day
  // keys made a local-midnight deferral in Asia look a day early, and a late-evening stamp
  // in the Americas look a day late.
  return toDateKey(deferredDate) > today;
}
