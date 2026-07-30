import type { NodeState, NodeType } from "@/db/schema";

/**
 * How deep each type sits in the hierarchy. Lower is broader.
 *
 * Result Area → Goal → Project → Task is the shape the app is *for*, but it is a planning
 * aid, not a filing requirement. There is only one rule: **you cannot go backwards.** A
 * child may be the same rank as its parent or deeper, never shallower — a Project never
 * contains a Goal. Each level may nest inside itself without limit, which is how Achieve
 * puts it: "use as many levels as you need."
 */
const RANK: Record<NodeType, number> = {
  result_area: 0,
  goal: 1,
  project: 2,
  task: 3,
};

/** Display names, used in the UI and in error messages. */
export const TYPE_LABELS: Record<NodeType, string> = {
  result_area: "Result Area",
  goal: "Goal",
  project: "Project",
  task: "Task",
};

/**
 * Display names for the work states, in the order Achieve lists them.
 *
 * One definition rather than one per surface: the outline column, its row editor, and the
 * detail forms all read from here, so widening the enum cannot leave a dropdown behind.
 */
export const STATE_LABELS: Record<NodeState, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  waiting: "Waiting",
  completed: "Completed",
  postponed: "Postponed",
  delegated: "Delegated",
  should_delegate: "Should delegate",
  cancelled: "Cancelled",
  proposed: "Proposed",
};

/**
 * The two-letter codes Achieve prints in the State column of its Projects and Tasks grids,
 * where a full label would cost more width than the column has.
 *
 * Distinct from the derived scheduling Status beside it — see `status.ts`.
 */
export const STATE_CODES: Record<NodeState, string> = {
  not_started: "NS",
  in_progress: "IP",
  waiting: "W",
  completed: "C",
  postponed: "P",
  delegated: "D",
  should_delegate: "SD",
  cancelled: "Cn",
  proposed: "PR",
};

/** The same list as `{ value, label }` pairs, for `<select>` and the form fields. */
export const STATE_OPTIONS: { value: NodeState; label: string }[] = (
  Object.keys(STATE_LABELS) as NodeState[]
).map((value) => ({ value, label: STATE_LABELS[value] }));

/**
 * The top level hosts anything.
 *
 * Requiring a home for every row is the busywork this app exists to avoid: the hierarchy
 * earns its keep when you plan top-down, but when you already know the specific thing you
 * need to do, working out where it belongs can cost more than doing it. Achieve agrees —
 * its project picker offers `<No Project>`, and its outline puts tasks straight under a
 * Result Area.
 *
 * These rules live here rather than in database CHECK constraints so they can be unit
 * tested, and so loosening the hierarchy does not require a migration.
 */
export function canNest(child: NodeType, parent: NodeType | null): boolean {
  return parent === null || RANK[child] >= RANK[parent];
}

/**
 * Throws a message naming both types, so the failure reads clearly whether it surfaces in
 * a test, a server action, or the UI.
 */
export function assertCanNest(child: NodeType, parent: NodeType | null): void {
  if (!canNest(child, parent)) {
    const parentLabel = parent === null ? "the top level" : `a ${TYPE_LABELS[parent]}`;
    throw new Error(`A ${TYPE_LABELS[child]} cannot go under ${parentLabel}.`);
  }
}

/** The type created by default when adding a child to `parent`. */
export function defaultChildType(parent: NodeType | null): NodeType {
  switch (parent) {
    case null:
      return "result_area";
    case "result_area":
    case "goal":
      return "project";
    case "project":
    case "task":
      return "task";
  }
}
