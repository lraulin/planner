import type { OutlineNode } from "@/lib/tree/types";
import { walkUp } from "@/lib/tree/walkUp";
import { daysBetweenKeys, toDateKey } from "@/lib/schedule/geometry";

/**
 * Date helpers shared by the chooser's scoring and its date filters.
 *
 * Everything here works in **calendar days as `YYYY-MM-DD` strings**, the same convention
 * `src/lib/tree/status.ts` already established for the Status column: a deadline at 09:00
 * is not "past" at 17:00, and no module calls `new Date()` on its own so the whole chooser
 * stays directly testable. Stored days decode with `toDateKey` (UTC components of the
 * UTC-noon encoding); the `today` handed in is the reader's local day.
 */

/**
 * Stored calendar day of a plan/record Date (`YYYY-MM-DD`).
 *
 * Deadlines and target dates are UTC noon. `toDateKey` is the decoder; `localDateKey`
 * would be tomorrow after ~8pm in the Americas for a live instant, which is why it
 * is not used here.
 */
export function dayString(date: Date): string {
  return toDateKey(date);
}

/**
 * Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative when `to` is in the past.
 */
export function daysBetween(from: string, to: string): number {
  return daysBetweenKeys(from, to);
}

/**
 * Achieve's "ancestor deadline": the **earliest** deadline on the node or any ancestor.
 *
 * A task inherits its project's deadline — that is what makes a whole project's worth of
 * work rise together as the date approaches — and when two ancestors both have one, the
 * tighter of the two is the real constraint.
 */
export function effectiveDeadline(
  node: OutlineNode,
  byId: Map<string, OutlineNode>,
): Date | null {
  let earliest: Date | null = null;

  for (const cur of walkUp(node, byId)) {
    if (cur.deadline && (earliest === null || cur.deadline < earliest)) {
      earliest = cur.deadline;
    }
  }

  return earliest;
}
