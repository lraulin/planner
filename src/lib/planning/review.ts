import type { NodeState, PriorityLetter } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";

/**
 * Which records steps 1, 2 and 4 of the wizard walk you through.
 *
 * Achieve's rule for step 2 is on the screen itself: "Only 'New' and 'Active' items with a
 * priority of A or higher are shown." That filter is the whole point of the step — a
 * weekly review that lists all 80 goals is a review nobody performs — but it is also the
 * filter that silently empties the step for someone who has not prioritised anything, so
 * every caller can widen it.
 */

/** Achieve's "New" and "Active". Everything else is done, parked, or someone else's. */
export const REVIEW_STATES: readonly NodeState[] = ["not_started", "in_progress"];

const PRIORITY_ORDER: PriorityLetter[] = ["A", "B", "C", "D"];

/**
 * "A or higher" in Achieve's direction of travel: A outranks B. An unprioritised record
 * ranks below every letter, so it is excluded by any minimum.
 */
export function isAtLeastPriority(
  letter: PriorityLetter | null,
  minimum: PriorityLetter | null,
): boolean {
  if (minimum === null) return true;
  if (letter === null) return false;
  return PRIORITY_ORDER.indexOf(letter) <= PRIORITY_ORDER.indexOf(minimum);
}

function isOpen(node: OutlineNode): boolean {
  return REVIEW_STATES.includes(node.state);
}

/**
 * Step 1's list: every result area still in play, in outline order. Result areas are the
 * spine of the plan, so this deliberately does not filter by priority — an area you never
 * prioritised is exactly the one worth being asked about.
 */
export function selectResultAreasForReview(nodes: OutlineNode[]): OutlineNode[] {
  return nodes.filter((n) => n.type === "result_area" && isOpen(n));
}

/**
 * Step 2's list: dreams first, then goals, each in outline order.
 *
 * Dreams lead because Achieve's step 2 asks for them first — a dream is the horizon a
 * goal is a step toward, and rereading it before the goals is the point of the ordering.
 */
export function selectGoalsForReview(
  nodes: OutlineNode[],
  options: { minPriority?: PriorityLetter | null } = {},
): OutlineNode[] {
  const minimum = options.minPriority === undefined ? "A" : options.minPriority;
  const eligible = nodes.filter(
    (n) =>
      n.type === "goal" && isOpen(n) && isAtLeastPriority(n.priorityLetter, minimum),
  );
  return [...eligible.filter((n) => n.isDream), ...eligible.filter((n) => !n.isDream)];
}

/**
 * Step 4's list: the projects a week can actually be committed to.
 *
 * Achieve offers "Only show projects with no sub-projects", because committing time to a
 * parent and to its children double-counts the same work. That is the default here for the
 * same reason, and the rollup columns still show the parent's total in the outline.
 */
export function selectProjectsForCommitment(
  nodes: OutlineNode[],
  options: { leafOnly?: boolean; includeCompleted?: boolean } = {},
): OutlineNode[] {
  const leafOnly = options.leafOnly ?? true;
  const projectParentIds = new Set(
    nodes.filter((n) => n.type === "project" && n.parentId).map((n) => n.parentId!),
  );

  return nodes.filter((n) => {
    if (n.type !== "project") return false;
    if (!options.includeCompleted && !isOpen(n)) return false;
    if (leafOnly && projectParentIds.has(n.id)) return false;
    return true;
  });
}

/** How far through a review step you are — the count under the step tab. */
export function reviewProgress(
  items: OutlineNode[],
  reviewedNodeIds: ReadonlySet<string>,
): { total: number; reviewed: number; complete: boolean } {
  const reviewed = items.filter((i) => reviewedNodeIds.has(i.id)).length;
  return {
    total: items.length,
    reviewed,
    complete: items.length > 0 && reviewed === items.length,
  };
}
