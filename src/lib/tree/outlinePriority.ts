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
 *
 * Takes one id or a block. A block lands contiguously from the requested rank, in the order
 * given, so a run of selected rows becomes `A1..An` rather than n rows claiming rank 1.
 */
export function planOutlinePriorityAssign(
  siblings: readonly PriorityNode[],
  nodeId: string | readonly string[],
  letter: PriorityLetter | null,
  rank: number | null,
): PriorityAssignment[] {
  return engine.planAssign([...siblings], nodeId, letter, rank);
}

/**
 * The whole priority plan for a node that is moving, in one place.
 *
 * Two things can need renumbering and they are different sibling groups: the letter the node
 * leaves has to close its gap, and the letter it joins has to make room. Which of those
 * apply depends on whether the parent changed and on whether the caller knows where among
 * the new peers the node belongs.
 *
 * - **A drag before or after a sibling** is the only move that says where: it takes that
 *   slot and pushes the rest down. Dropping beside an unprioritized row unprioritizes the
 *   node, which is the engine's "assume the target's priority" rule.
 * - **Every other move** — cut and paste, indent, outdent, a parent change in the drawer, an
 *   agent tool, a drag that lands as a child — says nothing about rank. The node keeps its
 *   letter and appends to the end of it under the new parent, because the end is the only
 *   honest answer to a question that was not asked.
 * - **A move within one parent with no placement** touches nothing. Outline order and
 *   priority are independent; sliding a row up the outline is not a claim about its rank.
 *
 * `source` is the old parent's children **including** the moved node; `destination` is the
 * new parent's children, and may or may not include it (same-parent moves pass the same
 * list for both). Pure — the caller persists what comes back.
 */
export function planOutlinePriorityMove({
  source,
  destination,
  nodeId,
  destinationParentId,
  placement,
}: {
  source: readonly PriorityNode[];
  destination: readonly PriorityNode[];
  nodeId: string;
  destinationParentId: string | null;
  placement?: { targetId: string; zone: LetterDropZone } | null;
}): PriorityAssignment[] {
  const moved = source.find((node) => node.id === nodeId);
  if (!moved) return [];

  const sameParent = moved.parentId === destinationParentId;
  // `siblingPool` inside the drop planner keys off `parentId`, so the moved node has to be in
  // the list it is joining even though its own `parentId` still names the old one.
  const joiningPool = destination.some((node) => node.id === nodeId)
    ? [...destination]
    : [...destination, moved];

  if (placement) {
    const landing = planSiblingPriorityDrop(
      joiningPool,
      [nodeId],
      placement.targetId,
      placement.zone,
      destinationParentId,
    );
    // A cross-parent drag still owes the letter it left a gap-close, which the landing plan
    // knows nothing about — it only ever looked at the destination.
    return sameParent ? landing : [...landing, ...gapCloseFor(source, nodeId)];
  }

  if (sameParent || moved.priorityLetter === null) return [];

  return [
    ...gapCloseFor(source, nodeId),
    ...engine.planAssign(joiningPool, nodeId, moved.priorityLetter, null),
  ];
}

/**
 * Close the hole a node leaves in its old letter, without touching the node itself — it is
 * taking its letter with it rather than losing it, so the engine's clear is half of what we
 * want.
 */
function gapCloseFor(
  source: readonly PriorityNode[],
  nodeId: string,
): PriorityAssignment[] {
  return engine.planClear([...source], nodeId).filter((a) => a.id !== nodeId);
}
