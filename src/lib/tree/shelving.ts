import type { NodeState } from "@/db/schema";

/**
 * One concept for "not on my plate right now", replacing two that used to disagree.
 *
 * The `postponed` **state** is the shelf. `deferred_date` is its **expiry** — no date means
 * shelved until you say otherwise (Achieve's Postponed), a date means it comes back on its
 * own. Before this, `slice.ts` hid rows by state and called it "the Deferred toggle" while
 * `views.ts` and `status.ts` hid them by date, so "why is this row missing?" had two answers
 * and only one of them was adjustable. The Chooser had already reached the same conclusion
 * for its own filters — see the note on `ChooserSettings.states`.
 *
 * Two rules make the whole thing:
 *
 * - **Expiry is derived, never swept.** A shelf whose date has passed simply stops counting.
 *   Nothing has to run at midnight and no clock lives in the database, which is why the
 *   stored state can read `postponed` long after the date went by. Callers pass `today` for
 *   the same reason `scheduleStatus` does — it is `null` on the server and before hydration,
 *   where nothing is treated as expired so both renders agree.
 * - **Shelving is inherited, latest wins, indefinite is infinity.** Deferring a project takes
 *   its subtree with it, a child shelved further out keeps its own later date, and an
 *   indefinite shelf anywhere up the chain outranks every date below it.
 *
 * Kept free of database access and of `new Date()` so it can be tested directly.
 */

/**
 * An active shelf. `until: null` is indefinite. `sourceId` is the node the shelf came from —
 * the node itself, or the ancestor it was inherited from, which is what lets the UI say
 * *why* a row is shelved rather than only that it is.
 */
export type Shelf = { until: Date | null; sourceId: string };

/** The shelf a row carries on its own, ignoring its ancestors. */
export function ownShelf(row: {
  id: string;
  state: NodeState;
  deferredDate: Date | null;
}): Shelf | null {
  // The state is what shelves a row. A deferred date on a row that is *not* postponed is the
  // residue of an expired shelf — nothing sweeps it — and means nothing on its own.
  if (row.state !== "postponed") return null;
  return { until: row.deferredDate, sourceId: row.id };
}

/**
 * The later of two shelves, with an indefinite one beating any date.
 *
 * Combining before expiry is applied is safe because "later" is monotonic with respect to
 * "is it still in the future": whichever shelf wins the comparison is also the one that
 * would outlast the other.
 */
export function laterShelf(a: Shelf | null, b: Shelf | null): Shelf | null {
  if (!a) return b;
  if (!b) return a;
  if (a.until === null) return a;
  if (b.until === null) return b;
  return b.until > a.until ? b : a;
}

/** Whether a shelf is still holding on `today`. `null` today never expires anything. */
export function shelfHolds(shelf: Shelf | null, today: string | null): boolean {
  if (!shelf) return false;
  if (shelf.until === null) return true;
  if (!today) return true;
  // Calendar days, matching `isDeferred`: a shelf expiring today is already open all day.
  return shelf.until.toISOString().slice(0, 10) > today;
}

/**
 * The state to display and filter on: `postponed` while a shelf holds, otherwise the stored
 * state.
 *
 * Finishing something takes it off the shelf — a completed task under a deferred project
 * reads completed, because it is. Everything else yields to the shelf, including a stored
 * `postponed` whose date has passed, which reads `not_started` again with nothing having
 * written to the row.
 */
export function effectiveState(
  state: NodeState,
  shelf: Shelf | null,
  today: string | null,
): NodeState {
  if (state === "completed" || state === "cancelled") return state;
  if (shelfHolds(shelf, today)) return "postponed";
  return state === "postponed" ? "not_started" : state;
}
