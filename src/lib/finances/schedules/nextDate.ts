/**
 * The stored `next_date` cursor: compute, advance, skip.
 *
 * Actual's `setNextDate` / `skipNextDate` (`packages/loot-core/src/server/schedules/app.ts`,
 * MIT, © James Long). The Friday trap at `:242` is load-bearing: skip + `weekendSolveMode:
 * 'before'` from a Friday would otherwise resolve back to the same date and appear to do
 * nothing.
 */

import { shiftDateKey, weekdayOfDateKey } from "@/lib/schedule/geometry";
import { occurrences, type RecurConfig } from "./recur";

function nextMonday(key: string): string {
  const weekday = weekdayOfDateKey(key);
  if (weekday === 1) return key;
  const days = weekday === 0 ? 1 : 8 - weekday;
  return shiftDateKey(key, days);
}

/**
 * Next occurrence on or after `fromKey`. Falls back to the last of a bounded series.
 */
export function nextOccurrence(config: RecurConfig, fromKey: string): string {
  return occurrences(config, fromKey, 1)[0] ?? config.start;
}

/** First upcoming date for a newly created or imported schedule. */
export function initialNextDate(config: RecurConfig, today: string): string {
  return nextOccurrence(config, today);
}

/**
 * Advance the cursor past a paid (or posted) occurrence.
 *
 * Starts the day after `paidOn` so the same occurrence cannot be returned.
 */
export function advanceNextDate(config: RecurConfig, paidOn: string): string {
  return nextOccurrence(config, shiftDateKey(paidOn, 1));
}

/**
 * Skip the current `nextDate` without writing a transaction.
 *
 * When `skipWeekend` solves `before`, a Friday (or weekend) cursor must be bumped to
 * Monday first — otherwise the rrule's Saturday occurrence weekend-solves straight back
 * to the Friday we are trying to leave (`app.ts:242`).
 */
export function skipNextDate(config: RecurConfig, currentNextDate: string): string {
  let from = shiftDateKey(currentNextDate, 1);
  if (config.skipWeekend === true && config.weekendSolveMode === "before") {
    const weekday = weekdayOfDateKey(currentNextDate);
    if (weekday === 5 || weekday === 6 || weekday === 0) {
      from = nextMonday(currentNextDate);
    }
  }
  return nextOccurrence(config, from);
}
