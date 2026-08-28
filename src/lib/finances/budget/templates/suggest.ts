/**
 * A per-occurrence amount suggested from this envelope's own spending history.
 *
 * The calendar decides how many occurrences a month holds; history only decides the dollars
 * per occurrence (spec D5). The divisor is therefore the summed weekday occurrences across
 * the same months the total was drawn from, not a count of months — averaging dollars per
 * month and then multiplying by weeks would smear 4- and 5-occurrence months together, which
 * is the whole reason the `weekly` type exists.
 *
 * The total is **all** spending in the category, not only the anchor-day transactions. The
 * mid-week milk run is real demand on the same envelope; dividing only the Sunday receipts
 * across the Sundays would systematically underfund it.
 *
 * Spec: `agent-os/specs/2026-08-27-1949-weekly-envelope-targets/` D5.
 */

import type { MonthKey } from "../envelope";
import type { AssignHistoryMonth } from "../assign/types";
import { countWeekdayInMonth } from "./weekly";

/** Longest window considered, in months. */
const MAX_WINDOW_MONTHS = 12;

/** Fewer qualifying months than this and there is no suggestion at all. */
const MIN_WINDOW_MONTHS = 3;

/**
 * Cents per occurrence of `weekday`, or null when there is not enough history to say.
 *
 * `currentMonth` is excluded along with everything after it: a month still in progress reads
 * as a light month and would drag the suggestion down for no reason.
 */
export function suggestWeeklyAmountCents({
  history,
  categoryId,
  weekday,
  currentMonth,
}: {
  history: readonly AssignHistoryMonth[];
  categoryId: string;
  weekday: number;
  currentMonth: MonthKey;
}): number | null {
  const complete = history.filter((entry) => entry.month < currentMonth);
  const spentIn = (entry: AssignHistoryMonth): number =>
    Math.max(0, -(entry.activity[categoryId] ?? 0));

  const first = complete.findIndex((entry) => spentIn(entry) > 0);
  if (first === -1) return null;
  const window = complete.slice(first).slice(-MAX_WINDOW_MONTHS);
  if (window.length < MIN_WINDOW_MONTHS) return null;

  const total = window.reduce((sum, entry) => sum + spentIn(entry), 0);
  const occurrences = window.reduce(
    (sum, entry) => sum + countWeekdayInMonth(entry.month, weekday),
    0,
  );
  if (total <= 0 || occurrences <= 0) return null;
  return Math.round(total / occurrences);
}
