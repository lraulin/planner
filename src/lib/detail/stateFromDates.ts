import type { NodeState } from "@/db/schema";
import { toDateKey } from "@/lib/schedule/geometry";

/**
 * The state a date edit implies.
 *
 * The dates and the state are two views of one fact, and the app already moved one
 * direction: setting a task In Progress stamps its actual start, completing it stamps the
 * completion. This closes the loop, because the fields are editable precisely so you can
 * correct the record — and a record saying a task was finished on the 3rd while its state
 * says Not Started is not a corrected record, it is a contradictory one.
 *
 * Precedence, when a single save touches more than one: **finished beats shelved beats
 * started.** Completion is the strongest claim a record can make about itself.
 *
 * The caller decides what counts as a change (empty→filled for Started on; a new calendar
 * day for Date completed — which must re-fire after a recurring cycle, when the column
 * already holds "last completed"). This function only maps those changes onto a state. The
 * drawer posts its whole draft on every save, so an unchanged date must arrive here as
 * null or re-deriving would fight whatever the user actually did. Clearing a date is never
 * a state change either: clearing a deferred date leaves a node **postponed indefinitely**,
 * which is the whole reason the state exists alongside the date, and un-shelving is done
 * from the State field.
 *
 * Pure, so the precedence can be tested without a database.
 */
export type ImpliedState = { state: NodeState; at: Date | null };

export function stateFromDates(opts: {
  /** The state stored before this save. */
  current: NodeState;
  /**
   * Non-null when Date completed was set or moved to a different calendar day by this
   * save. Already-completed tasks ignore it (a correction, not a second completion).
   */
  completedAt: Date | null;
  /** Non-null when Deferred until was newly set — or moved — by this save. */
  deferredUntil: Date | null;
  /** Non-null when Started on was newly filled in by this save. */
  startedAt: Date | null;
  /** `YYYY-MM-DD`. A deferred date not after today shelves nothing. */
  today: string | null;
}): ImpliedState | null {
  const { current, completedAt, deferredUntil, startedAt, today } = opts;

  if (completedAt && current !== "completed") {
    return { state: "completed", at: completedAt };
  }

  // A date already gone by is not a shelf — it is the residue of one that has expired, and
  // re-shelving on it would hide nothing while making the State column lie. Compared as day
  // labels: the stored day through `toDateKey` (UTC components), against the caller's local
  // `today`.
  if (
    deferredUntil &&
    (!today || toDateKey(deferredUntil) > today) &&
    current !== "completed" &&
    current !== "cancelled" &&
    current !== "postponed"
  ) {
    return { state: "postponed", at: null };
  }

  // Only from Not Started. Starting something already In Progress, Waiting or Delegated says
  // nothing new, and a completed task acquiring a start date is a correction to the record
  // rather than a claim that it is running again.
  if (startedAt && current === "not_started") {
    return { state: "in_progress", at: null };
  }

  return null;
}
