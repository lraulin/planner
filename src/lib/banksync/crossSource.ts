/**
 * Window arithmetic for a sync run. The matching itself lives in
 * `@/lib/finances/liveFeedMatch`, because the importer needs the same rules pointing the
 * other way and `src/lib/finances` must not depend on this module.
 */

import { DATE_TOLERANCE_DAYS } from "@/lib/finances/liveFeedMatch";
import { toDateKey } from "@/lib/schedule/geometry";
import { balanceAsOf, type SimpleFinAccount } from "./mapping";

export { DATE_TOLERANCE_DAYS };

export type SyncWindow = {
  /** Earliest day to ask the provider for. */
  fetchFrom: string;
  /** Earliest existing register row to compare against. */
  compareFrom: string;
  /** Latest existing register row to compare against. */
  compareTo: string;
};

const shiftDay = (key: string, days: number): string => {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * Which days to fetch, and which existing rows to weigh them against.
 *
 * Pure because the relationship between the three dates is the part that was wrong once and
 * is invisible when it is: **`compareFrom` must reach back past `fetchFrom`** by at least
 * the matcher's date tolerance. A statement dated two days before the window still records
 * the same event as a feed row inside it, and loading existing rows from `fetchFrom` hides
 * exactly those — which duplicates every transaction sitting on the boundary. That produced
 * three duplicates on the first real run and would have produced a few more every sync.
 *
 * `anchor` is where the last sync finished, or failing that the newest row the register
 * already holds; `maxInitialDays` caps how far a first sync reaches back.
 */
export function syncWindow(
  anchor: string | null,
  today: string,
  overlapDays: number,
  maxInitialDays: number,
): SyncWindow {
  const floor = shiftDay(today, -maxInitialDays);
  const proposed = anchor ? shiftDay(anchor, -overlapDays) : floor;
  const fetchFrom = proposed > floor ? proposed : floor;

  return {
    fetchFrom,
    compareFrom: shiftDay(fetchFrom, -DATE_TOLERANCE_DAYS),
    compareTo: shiftDay(today, DATE_TOLERANCE_DAYS),
  };
}

/**
 * Where the next sync should resume from, anchored on the **stalest** linked account rather
 * than the day this sync happened to run.
 *
 * `syncedThrough` used to mean "the day we last called" and advanced to today on every sync,
 * even when an account's own data had stalled. On 2026-09-13 Capital One's `balance-date`
 * stuck at Sep 8 for six days while other accounts kept moving; the old anchor advanced
 * anyway, so the next fetch started past Sep 8 and two charges the provider was merely late
 * on (SMECO, Neon, posted Sep 2) never arrived once it caught up.
 *
 * The oldest `balance-date` day across the accounts in this response is the day every linked
 * account is confirmed current through, so that is the new anchor — capped at today in case a
 * clock disagrees. An account the response says nothing about (no `balance-date` at all)
 * cannot make the anchor either older or newer, so it is simply excluded; if nothing in the
 * response has one, the anchor is left exactly where it was.
 */
export function nextSyncedThrough(
  accounts: readonly SimpleFinAccount[],
  previous: string | null,
  today: string,
): string {
  const dateKeys = accounts.flatMap((account) => {
    const asOf = balanceAsOf(account);
    return asOf ? [toDateKey(asOf)] : [];
  });
  if (dateKeys.length === 0) return previous ?? today;
  const oldest = dateKeys.reduce((min, key) => (key < min ? key : min));
  return oldest > today ? today : oldest;
}
