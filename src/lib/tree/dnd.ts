import type { NodeType } from "@/db/schema";
import { canNest } from "./hierarchy";
import { categoryLabelFromGroupId, categoryOf, categoryValueFromLabel } from "./slice";
import type { OutlineNode, Position } from "./types";

/**
 * Where a dragged row lands, given the pointer's position over a target row.
 *
 * The hard part of tree drag-and-drop is not the gesture — it is that the gesture is
 * ambiguous. A drop line drawn under a row could mean "next sibling", "first child of the
 * row above", or "next sibling of one of its ancestors", and the hierarchy rule (`canNest`)
 * rules some of those out on any given drop. This module resolves the ambiguity in one
 * place, as pure data, so the grid can draw an indicator at the depth the node will
 * *actually* land at rather than at the depth the cursor happens to be over.
 *
 * The server validates independently (`moveNode` re-checks nesting and self-containment) —
 * this is for feedback during the drag, not for safety.
 */

/** Which third of the target row the pointer is over. */
export type DropZone = "before" | "after" | "inside";

/** The subset of an outline node this resolver reads. `OutlineNode` satisfies it. */
export type DropNode = {
  id: string;
  parentId: string | null;
  type: NodeType;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
};

export type ResolvedDrop = {
  parentId: string | null;
  position: Position;
  /** Depth the dragged node will land at — where the drop indicator is drawn. */
  depth: number;
  /**
   * Result areas only: stored category to write when the drop lands at the root under a
   * category group (or next to a root in another group). Omitted means leave as-is;
   * `null` clears the category.
   */
  category?: string | null;
};

/** True when `nodeId` is `ancestorId` itself or sits somewhere beneath it. */
export function isSelfOrDescendant(
  byId: Map<string, DropNode>,
  ancestorId: string,
  nodeId: string | null,
): boolean {
  let current = nodeId;
  while (current !== null) {
    if (current === ancestorId) return true;
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

/**
 * Resolves a hover into a concrete move, or null when no legal move exists there.
 *
 * Zones are forgiving rather than strict: a drop the hierarchy forbids as a child falls
 * back to a sibling placement instead of becoming a dead area in the middle of every row.
 * The returned `depth` is what makes that honest — the indicator moves to the level the
 * node is really going to.
 */
export function resolveDrop(
  dragId: string,
  targetId: string,
  zone: DropZone,
  byId: Map<string, DropNode>,
): ResolvedDrop | null {
  const drag = byId.get(dragId);
  const target = byId.get(targetId);
  if (!drag || !target) return null;

  // A node cannot land on itself or inside its own subtree — it would take the drop site
  // with it.
  if (isSelfOrDescendant(byId, dragId, targetId)) return null;

  // Dropping onto the body of a row makes the dragged node its last child.
  if (zone === "inside" && canNest(drag.type, target.type)) {
    return { parentId: target.id, position: { at: "last" }, depth: target.depth + 1 };
  }

  // The gap under an *open* parent sits directly above that parent's own children, so it
  // reads as "first child", not "next sibling". Under a collapsed or childless row there
  // is nothing between it and the next sibling, so the plain reading stands.
  if (
    zone === "after" &&
    target.hasChildren &&
    !target.collapsed &&
    canNest(drag.type, target.type)
  ) {
    return { parentId: target.id, position: { at: "first" }, depth: target.depth + 1 };
  }

  // Otherwise land beside the target — or, when the target's level will not have it,
  // beside the nearest ancestor whose level will. Dragging a result area over a task deep
  // inside a project snaps the line all the way out to the top level, since none of those
  // levels can host it. The walk always terminates: the top level hosts every type.
  const at = zone === "before" ? "before" : "after";
  let anchor: DropNode | null = target;

  while (anchor) {
    const parent: DropNode | null = anchor.parentId
      ? (byId.get(anchor.parentId) ?? null)
      : null;
    if (anchor.parentId !== null && parent === null) return null;

    if (canNest(drag.type, parent?.type ?? null)) {
      return {
        parentId: anchor.parentId,
        position: { at, siblingId: anchor.id },
        depth: anchor.depth,
      };
    }

    anchor = parent;
  }

  return null;
}

/**
 * Drop onto an outline category group header while "By category" is on.
 *
 * Only root-level result areas change category this way — nested areas inherit from their
 * parent result area, and non-areas have no category of their own (they group under a
 * result area or under "(No Category)").
 *
 * Lands at the root after the last current root in that category (or first at root when
 * the group is empty of roots).
 */
export function resolveCategoryGroupDrop(
  dragId: string,
  groupId: string,
  byId: Map<string, OutlineNode>,
  /** Full outline in tree order — used to find the last root already in the group. */
  nodes: OutlineNode[],
): ResolvedDrop | null {
  const label = categoryLabelFromGroupId(groupId);
  if (label === null) return null;

  const drag = byId.get(dragId);
  if (!drag || drag.type !== "result_area" || drag.parentId !== null) return null;

  const category = categoryValueFromLabel(label);
  const lastRoot = lastRootInCategory(label, nodes, byId, dragId);

  if (lastRoot) {
    return {
      parentId: null,
      position: { at: "after", siblingId: lastRoot.id },
      depth: 0,
      category,
    };
  }

  return {
    parentId: null,
    position: { at: "first" },
    depth: 0,
    category,
  };
}

/**
 * When "By category" is on and a result area stays (or becomes) a root, take the category
 * of the placement's sibling so dragging into another group's rows reassigns the area.
 * Nested placements leave category to server-side inheritance.
 */
export function withRootCategoryFromPlacement(
  drop: ResolvedDrop,
  dragId: string,
  byId: Map<string, OutlineNode>,
): ResolvedDrop {
  if (drop.parentId !== null) return drop;

  const drag = byId.get(dragId);
  if (!drag || drag.type !== "result_area") return drop;

  const siblingId =
    drop.position.at === "before" || drop.position.at === "after"
      ? drop.position.siblingId
      : null;
  if (!siblingId) return drop;

  const sibling = byId.get(siblingId);
  if (!sibling) return drop;

  const label = categoryOf(sibling, byId);
  return { ...drop, category: categoryValueFromLabel(label) };
}

function lastRootInCategory(
  label: string,
  nodes: OutlineNode[],
  byId: Map<string, OutlineNode>,
  excludeId: string,
): OutlineNode | null {
  let last: OutlineNode | null = null;
  for (const node of nodes) {
    if (node.id === excludeId) continue;
    if (node.parentId !== null) continue;
    if (categoryOf(node, byId) === label) last = node;
  }
  return last;
}
