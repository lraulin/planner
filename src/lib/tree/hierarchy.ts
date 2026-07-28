import type { NodeState, NodeType } from "@/db/schema";

/**
 * Which parents each node type may sit under. `null` means the root of the outline.
 *
 * Each level may nest inside itself without limit — Achieve lets you "use as many levels as
 * you need" — but the levels themselves stay ordered: a Project never contains a Goal.
 *
 * These rules live here rather than in database CHECK constraints so they can be unit
 * tested, and so loosening the hierarchy later does not require a migration.
 */
export const LEGAL_PARENTS: Record<NodeType, ReadonlyArray<NodeType | null>> = {
  result_area: [null],
  goal: ["result_area", "goal"],
  project: ["result_area", "goal", "project"],
  task: ["project", "task"],
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

export function canNest(child: NodeType, parent: NodeType | null): boolean {
  return LEGAL_PARENTS[child].includes(parent);
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
