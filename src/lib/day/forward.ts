import type { NodeState } from "@/db/schema";

/**
 * Carry-over: which rows from earlier days follow you into today.
 *
 * The rule the daily list rests on is that a day assignment is **not a deadline**. An item
 * you meant to do on Tuesday and did not is not overdue on Wednesday — it is just still
 * something you intend to do. So it moves forward, and Tuesday keeps a `forwardedTo` mark
 * rather than being quietly rewritten, which is how the day's record stays honest about
 * what was planned versus what happened.
 *
 * This does not contradict "nothing appears on a day unless you put it there": you *did*
 * put these on a day. Forwarding is that decision persisting, not the app inventing work.
 * Nothing is ever pulled in from the Task Chooser on its own.
 *
 * Pure — no `Date`, no database. `today` is `YYYY-MM-DD`, the convention used throughout
 * (`src/lib/chooser/dates.ts`, `src/lib/tree/status.ts`).
 */

/** The fields carry-over actually reads. */
export type ForwardCandidate = {
  id: string;
  /** `YYYY-MM-DD`. */
  day: string;
  state: NodeState;
  completedAt: Date | null;
  /** `YYYY-MM-DD`, set when this row was already forwarded somewhere. */
  forwardedTo: string | null;
};

/**
 * States that do not follow you forward.
 *
 * `cancelled` is a deliberate decision not to do the thing (not the same as deleting the
 * row or the task), which forwarding would silently reverse. `completed` is belt-and-braces
 * alongside the `completedAt` check.
 */
const SETTLED: NodeState[] = ["cancelled", "completed"];

/**
 * The ids of rows that should be carried to `today`.
 *
 * Only rows strictly *before* today move. Rows placed on a future day are the whole point
 * of the week view — planning ahead — and must be left alone. Rows already carrying a
 * `forwardedTo` are skipped, which is what makes running this repeatedly a no-op.
 */
export function itemsToForward(items: ForwardCandidate[], today: string): string[] {
  return items
    .filter(
      (item) =>
        item.day < today &&
        item.completedAt === null &&
        item.forwardedTo === null &&
        !SETTLED.includes(item.state),
    )
    .map((item) => item.id);
}
