import type { OutlineNode } from "@/lib/tree/types";

/**
 * Date helpers shared by the chooser's scoring and its date filters.
 *
 * Everything here works in **calendar days as `YYYY-MM-DD` strings**, the same convention
 * `src/lib/tree/status.ts` already established for the Status column: a deadline at 09:00
 * is not "past" at 17:00, and no module calls `new Date()` on its own so the whole chooser
 * stays directly testable.
 */

/** The calendar day a timestamp falls on, as `YYYY-MM-DD`. */
export function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative when `to` is in the past.
 *
 * Both sides are parsed as UTC midnight so the subtraction never lands mid-day and
 * daylight saving cannot shift a boundary — the same trick `status.ts` uses.
 */
export function daysBetween(from: string, to: string): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY,
  );
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
  let cur: OutlineNode | undefined = node;

  while (cur) {
    if (cur.deadline && (earliest === null || cur.deadline < earliest)) {
      earliest = cur.deadline;
    }
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  return earliest;
}
