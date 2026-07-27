import type { NodeType } from "@/db/schema";

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
