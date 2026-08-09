import type { NodeState, PriorityLetter } from "@/db/schema";
import { daysBetweenKeys, toDateKey } from "@/lib/schedule/geometry";
import { effectiveState, type Shelf } from "./shelving";
import type { OutlineNode } from "./types";

/**
 * Achieve's derived scheduling status — the "Status" column on Projects, Tasks, and the
 * Task Chooser, distinct from the user-set `State` beside it.
 *
 * Manual §3.8. We do not have the effort-based auto-scheduler, so bands that depend only
 * on dates, state, and priority are implemented; "not ancestor scheduled" rules that need
 * effort-driven flags and next-action-reminder detection are approximated (D priority and
 * never-dated NS work → Not Scheduled).
 *
 * Pure and free of `new Date()` — the caller supplies `today` as `YYYY-MM-DD`.
 */

export type ScheduleStatus =
  | "completed"
  | "overdue"
  | "due_today"
  | "due_tomorrow"
  | "behind_schedule"
  | "close_to_deadline"
  | "no_slack"
  | "due_soon"
  | "deferred"
  | "need_to_start"
  | "waiting"
  | "ongoing"
  | "not_scheduled"
  | "on_schedule";

export const STATUS_LABELS: Record<ScheduleStatus, string> = {
  completed: "Completed",
  overdue: "Overdue",
  due_today: "Due Today",
  due_tomorrow: "Due Tomorrow",
  behind_schedule: "Behind Schedule",
  close_to_deadline: "Close to Deadline",
  no_slack: "No Slack",
  due_soon: "Due Soon",
  // Product vocabulary: shelved work (postponed state / deferred date). Achieve's schedule
  // status name is "Postponed"; we keep Deferred while State and the date field stay linked.
  deferred: "Deferred",
  need_to_start: "Need to Start",
  waiting: "Waiting",
  ongoing: "Ongoing",
  not_scheduled: "Not Scheduled",
  on_schedule: "On Schedule",
};

/** Days out for Close to Deadline (after Due Today / Due Tomorrow have been claimed). */
const CLOSE_TO_DEADLINE_DAYS = 2;
const DUE_SOON_DAYS = 5;
const NO_SLACK_DAYS = 1;

/**
 * Inputs for a single node's **local** status (before parent propagation).
 *
 * `shelf` is own-or-inherited; see `shelving.ts`. While the shelf still holds, the row
 * reads Deferred unless a finished state wins.
 */
export type ScheduleStatusInput = {
  deadline: Date | null;
  targetStart: Date | null;
  targetEnd: Date | null;
  state: NodeState;
  today: string | null;
  shelf?: Shelf | null;
  /** Own priority letter — D items are Not Scheduled when nothing more urgent applies. */
  priorityLetter?: PriorityLetter | null;
};

/**
 * Local schedule status for one item (manual §3.8), without child→parent propagation.
 *
 * Returns `on_schedule` when `today` is unknown so SSR and the first client paint match.
 */
export function scheduleStatus(input: ScheduleStatusInput): ScheduleStatus {
  const {
    deadline,
    targetStart,
    targetEnd,
    state,
    today,
    shelf = null,
    priorityLetter = null,
  } = input;

  if (state === "completed" || state === "cancelled") return "completed";

  // Every band below reads the *effective* state, not the stored one. A shelf that ran out
  // is not swept, so `state` stays `postponed` long after the row came back — and reading
  // that raw made `started` true, which is how a routine due again this morning came out
  // as Ongoing (started work, no near end date) instead of Need to Start.
  const effective = effectiveState(state, shelf, today);

  // Shelf still holds → not on your plate. Finished already returned above.
  if (effective === "postponed") return "deferred";

  if (!today) return "on_schedule";

  const due = deadline ? daysBetweenKeys(today, toDateKey(deadline)) : null;
  const start = targetStart ? daysBetweenKeys(today, toDateKey(targetStart)) : null;
  const end = targetEnd ? daysBetweenKeys(today, toDateKey(targetEnd)) : null;
  const started = effective !== "not_started";

  // --- Deadline bands (manual order) ---
  if (due !== null && due < 0) return "overdue";
  if (due !== null && due === 0) return "due_today";
  if (due !== null && due === 1) return "due_tomorrow";

  // Behind Schedule (§3.8):
  // - target end past the deadline (and not postponed — already handled)
  // - NS with target start before today
  // - started with target end before today
  if (deadline && targetEnd && toDateKey(targetEnd) > toDateKey(deadline)) {
    return "behind_schedule";
  }
  if (!started && start !== null && start < 0) return "behind_schedule";
  if (started && end !== null && end < 0) return "behind_schedule";

  if (due !== null && due <= CLOSE_TO_DEADLINE_DAYS) return "close_to_deadline";

  // No Slack: target end within one day of the deadline.
  if (
    deadline &&
    targetEnd &&
    daysBetweenKeys(toDateKey(targetEnd), toDateKey(deadline)) <= NO_SLACK_DAYS &&
    daysBetweenKeys(toDateKey(targetEnd), toDateKey(deadline)) >= 0
  ) {
    return "no_slack";
  }

  // Due Soon: deadline within 5 days, or started work with target end within 5 days.
  if (due !== null && due <= DUE_SOON_DAYS) return "due_soon";
  if (started && end !== null && end <= DUE_SOON_DAYS && end >= 0) return "due_soon";

  // Need to Start: NS with target start of today.
  if (!started && start === 0) return "need_to_start";

  if (effective === "waiting") return "waiting";

  // Ongoing: started, not waiting, end missing or more than 5 days out.
  if (started && (end === null || end > DUE_SOON_DAYS)) return "ongoing";

  // Not Scheduled approximation: D priority, or NS with no plan dates at all.
  if (priorityLetter === "D") return "not_scheduled";
  if (!started && due === null && start === null && end === null) {
    return "not_scheduled";
  }

  return "on_schedule";
}

/** Convenience: local status from an outline node. */
export function scheduleStatusForNode(
  node: Pick<
    OutlineNode,
    "deadline" | "targetStart" | "targetEnd" | "state" | "shelf" | "priorityLetter"
  >,
  today: string | null,
): ScheduleStatus | null {
  if (node.state === null) return null;
  return scheduleStatus({
    deadline: node.deadline,
    targetStart: node.targetStart,
    targetEnd: node.targetEnd,
    state: node.state,
    shelf: node.shelf,
    priorityLetter: node.priorityLetter,
    today,
  });
}

/**
 * Statuses that Achieve propagates from child to parent (§3.8 notes on Overdue, Due
 * Today/Tomorrow, Behind Schedule, Close to Deadline, No Slack, Due Soon).
 */
const PROPAGATES: ReadonlySet<ScheduleStatus> = new Set([
  "overdue",
  "due_today",
  "due_tomorrow",
  "behind_schedule",
  "close_to_deadline",
  "no_slack",
  "due_soon",
]);

/** Lower index = more urgent when merging a parent's local status with children. */
const URGENCY: ScheduleStatus[] = [
  "overdue",
  "due_today",
  "due_tomorrow",
  "behind_schedule",
  "close_to_deadline",
  "no_slack",
  "due_soon",
  "need_to_start",
  "deferred",
  "waiting",
  "ongoing",
  "not_scheduled",
  "on_schedule",
  "completed",
];

function urgencyIndex(status: ScheduleStatus): number {
  const i = URGENCY.indexOf(status);
  return i === -1 ? URGENCY.length : i;
}

function moreUrgent(a: ScheduleStatus, b: ScheduleStatus): ScheduleStatus {
  return urgencyIndex(a) <= urgencyIndex(b) ? a : b;
}

/**
 * Local status for every node, then child→parent propagation for the bands Achieve rolls
 * up. Parents before children in `nodes` (outline depth-first order) is fine — we walk
 * bottom-up via recursion with memoization.
 */
export function scheduleStatusById(
  nodes: OutlineNode[],
  today: string | null,
): Map<string, ScheduleStatus> {
  const childIds = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const list = childIds.get(n.parentId);
    if (list) list.push(n.id);
    else childIds.set(n.parentId, [n.id]);
  }

  const local = new Map<string, ScheduleStatus>();
  for (const n of nodes) {
    const status = scheduleStatusForNode(n, today);
    if (status !== null) local.set(n.id, status);
  }

  const result = new Map<string, ScheduleStatus>();

  function visit(id: string): ScheduleStatus | null {
    const cached = result.get(id);
    if (cached) return cached;

    const own = local.get(id);
    // Result Areas deliberately terminate status rollup: their children keep their own
    // statuses, but an enduring role never becomes Overdue because work beneath it did.
    if (!own) return null;
    let best = own;
    for (const childId of childIds.get(id) ?? []) {
      const childStatus = visit(childId);
      if (childStatus !== null && PROPAGATES.has(childStatus)) {
        best = moreUrgent(best, childStatus);
      }
    }
    result.set(id, best);
    return best;
  }

  for (const n of nodes) visit(n.id);
  return result;
}
