import type { PriorityLetter } from "@/db/schema";
import {
  letterRankEngine,
  type LetterAssignment,
  type LetterDropZone,
} from "@/lib/priority/letterRank";
import type { Position } from "./types";

/**
 * Achieve-style outline priorities on drag.
 *
 * Priorities are relative to the immediate parent (siblings only). Dropping a row before
 * or after a sibling makes the dragged row(s) take that letter's dense ranks around the
 * target and shifts the rest — same rules as Day / TC Priority, but the pool is the
 * destination parent's children, not a flat global list.
 *
 * Reparenting as a child (`inside` / first / last under a new parent) does not rewrite
 * priorities here: the structural move stands alone; relative ranks among the new
 * siblings stay until the user reorders among them.
 *
 * Unranked targets: the letterRank engine clears the dragged items (Achieve: assume the
 * target's priority). Bare letters densify to ranks on the next ranked drop — gaps can
 * still exist until then, matching Achieve's optional rank.
 */

export type PriorityNode = {
  id: string;
  parentId: string | null;
  priorityLetter: PriorityLetter | null;
  priorityRank: number | null;
};

export type PriorityAssignment = LetterAssignment;

const engine = letterRankEngine<PriorityNode>((item) => ({
  letter: item.priorityLetter,
  rank: item.priorityRank,
}));

/**
 * Siblings that will share `parentId` after the move: current children of that parent,
 * plus any dragged nodes that are joining from elsewhere, minus nothing already listed.
 */
function siblingPool(
  nodes: readonly PriorityNode[],
  parentId: string | null,
  dragIds: readonly string[],
): PriorityNode[] {
  const dragSet = new Set(dragIds);
  const underParent = nodes.filter(
    (node) => node.parentId === parentId && !dragSet.has(node.id),
  );
  const joining = dragIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is PriorityNode => node != null);
  return [...underParent, ...joining];
}

/**
 * Priority rewrites for a sibling placement (`before` / `after` a known sibling).
 * Empty when the placement is not a sibling slot (first/last/inside without an anchor).
 */
export function planSiblingPriorityDrop(
  nodes: readonly PriorityNode[],
  dragIds: readonly string[],
  targetId: string,
  zone: LetterDropZone,
  destinationParentId: string | null,
): PriorityAssignment[] {
  if (dragIds.length === 0) return [];
  if (dragIds.includes(targetId)) return [];

  const pool = siblingPool(nodes, destinationParentId, dragIds);
  if (!pool.some((node) => node.id === targetId)) return [];

  return engine.planDrop(pool, dragIds, targetId, zone);
}

/**
 * From a resolved tree drop position, decide whether sibling priority renumbering applies
 * and with which zone/target. `first` / `last` / missing sibling → no priority rewrite.
 */
export function priorityDropFromPosition(
  position: Position,
): { targetId: string; zone: LetterDropZone } | null {
  if (position.at === "before" || position.at === "after") {
    return { targetId: position.siblingId, zone: position.at };
  }
  return null;
}

/**
 * Priority assignment by typing, over one parent's complete child set.
 *
 * The counterpart to `planSiblingPriorityDrop` for the keyboard path, and the reason the
 * outline can promise that a letter always carries a rank: `A` appends to the end of that
 * letter, `A1` inserts and pushes the rest down, a rank past the end clamps to the end, and
 * `null` unranks and closes the gap left behind.
 *
 * `siblings` must be the **complete** set of children of the node's parent — every caller
 * loads it from the database rather than from whatever the grid is showing. A renumber that
 * only accounted for visible rows would silently collapse the ranks of everything a filter
 * had hidden.
 */
export function planOutlinePriorityAssign(
  siblings: readonly PriorityNode[],
  nodeId: string,
  letter: PriorityLetter | null,
  rank: number | null,
): PriorityAssignment[] {
  return engine.planAssign([...siblings], nodeId, letter, rank);
}
