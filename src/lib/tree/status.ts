import type { NodeState } from "@/db/schema";
import { daysBetweenKeys, toDateKey } from "@/lib/schedule/geometry";
import { effectiveState, type Shelf } from "./shelving";

/**
 * Achieve's derived scheduling status — the "Status" column on the Projects and Tasks
 * tabs, distinct from the user-set `State` beside it.
 *
 * Achieve computes this from its auto-scheduler, which we do not have. Until the weekly
 * calendar exists, it is driven by the deadline alone, in the bands Lee uses.
 *
 * Kept free of database access and of `new Date()` so it can be tested directly. The
 * caller supplies today, as the grid already does for the overdue deadline colour.
 */
export type ScheduleStatus =
  | "completed"
  | "deferred"
  | "overdue"
  | "due_today"
  | "due_tomorrow"
  | "close_to_deadline"
  | "due_soon"
  | "on_schedule";

export const STATUS_LABELS: Record<ScheduleStatus, string> = {
  completed: "Completed",
  deferred: "Deferred",
  overdue: "Overdue",
  due_today: "Due Today",
  due_tomorrow: "Due Tomorrow",
  close_to_deadline: "Close to Deadline",
  due_soon: "Due Soon",
  on_schedule: "On Schedule",
};

/** Days out at which each band starts. The first match wins, so order matters. */
const CLOSE_TO_DEADLINE_DAYS = 2;
const DUE_SOON_DAYS = 5;

/**
 * `today` is `YYYY-MM-DD`, matching how `DeadlineCell` already decides "overdue" — a
 * string comparison of calendar days, so a deadline at 09:00 is not "past" at 17:00.
 *
 * Returns `on_schedule` when today is unknown (server render, before hydration), so the
 * column renders the same on both sides and nothing flashes during hydration.
 *
 * `shelf` is what is holding the row off your plate, its own or an ancestor's — see
 * `src/lib/tree/shelving.ts`. While it holds, the row reads **Deferred**; once it expires
 * the row goes back to being judged on its deadline alone, with nothing having written to
 * it. It never escalates on its own: a repeating routine has no deadline by design, so it
 * can never become Overdue, which is the point of the model.
 */
export function scheduleStatus(
  deadline: Date | null,
  today: string | null,
  state: NodeState,
  shelf: Shelf | null = null,
): ScheduleStatus {
  if (state === "completed" || state === "cancelled") return "completed";
  if (effectiveState(state, shelf, today) === "postponed") return "deferred";
  if (!deadline || !today) return "on_schedule";

  const due = toDateKey(deadline);
  const daysOut = daysBetweenKeys(today, due);

  if (daysOut < 0) return "overdue";
  if (daysOut === 0) return "due_today";
  if (daysOut === 1) return "due_tomorrow";
  if (daysOut <= CLOSE_TO_DEADLINE_DAYS) return "close_to_deadline";
  if (daysOut <= DUE_SOON_DAYS) return "due_soon";
  return "on_schedule";
}
