/**
 * Window arithmetic for a sync run. The matching itself lives in
 * `@/lib/finances/liveFeedMatch`, because the importer needs the same rules pointing the
 * other way and `src/lib/finances` must not depend on this module.
 */

import { DATE_TOLERANCE_DAYS } from "@/lib/finances/liveFeedMatch";

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
