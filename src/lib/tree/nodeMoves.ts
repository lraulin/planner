import { db } from "@/db";
import { nodes, resultAreaDetails } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { syncDayLinesInSubtree } from "@/lib/day/sync";
import { assertCanNest } from "./hierarchy";
import { planOutlinePriorityMove } from "./outlinePriority";
import type { LetterDropZone } from "@/lib/priority/letterRank";
import type { Position } from "./types";
import {
  expandParent,
  isSelfOrDescendant,
  requireNode,
  resultAreaCategory,
  siblingKeys,
  sortKeyFor,
  subtreeIds,
  type Executor,
} from "./nodeRows";
import { applyPriorityAssignments, siblingPriorityPool } from "./priorityWrites";

/**
 * Moving nodes: reparenting and reordering, indent and outdent, and the category and
 * priority that follow a move. Every write proves the node is the caller's first.
 */

/** Moves a node under a new parent and/or to a new position among its siblings. */
export async function moveNode(params: {
  userId: string;
  nodeId: string;
  parentId: string | null;
  position: Position;
  /**
   * Result areas only. When the area lands at the root, the Outline's category groups pass
   * the destination category here (`null` clears it). Nested under another result area, the
   * parent's category always wins and this is ignored. Omitted leaves the stored value alone.
   */
  category?: string | null;
  /**
   * Where the node lands among its new peers' priorities, when the caller knows. A drag
   * before or after a sibling does; nothing else does, so the node otherwise appends to the
   * end of its letter under the new parent.
   *
   * Passed rather than applied afterwards so the move and the renumber are one transaction.
   * The alternative — the client planning the renumber and sending one write per affected
   * row — puts a whole sibling group's ranks behind a sequence of round trips that can fail
   * halfway.
   */
  priorityPlacement?: { targetId: string; zone: LetterDropZone };
}): Promise<void> {
  const { userId, nodeId, parentId, position, category, priorityPlacement } = params;

  await db.transaction(async (tx) => {
    const node = await requireNode(tx, userId, nodeId);

    if (await isSelfOrDescendant(tx, userId, nodeId, parentId)) {
      throw new Error("A node cannot be moved inside itself.");
    }

    const parentType = parentId ? (await requireNode(tx, userId, parentId)).type : null;
    assertCanNest(node.type, parentType);

    // Both sibling groups as they stand *before* the move, which is what the planners read.
    const sourceSiblings = await siblingPriorityPool(tx, userId, node.parentId);
    const destinationSiblings =
      parentId === node.parentId
        ? sourceSiblings
        : await siblingPriorityPool(tx, userId, parentId);

    const sortKey = await sortKeyFor(tx, userId, parentId, position, nodeId);

    await tx
      .update(nodes)
      .set({ parentId, sortKey, updatedAt: new Date() })
      .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));

    // Same reason create expands: indent, paste-as-child, and drop-inside would otherwise
    // file the row under a closed parent and read as the node vanishing.
    await expandParent(tx, userId, parentId);

    // Priority follows the move, so neither group is left with a gap or a collision.
    await applyPriorityAssignments(
      tx,
      userId,
      planOutlinePriorityMove({
        source: sourceSiblings,
        destination: destinationSiblings,
        nodeId,
        destinationParentId: parentId,
        placement: priorityPlacement,
      }),
    );

    if (node.type === "result_area") {
      if (parentType === "result_area" && parentId) {
        // Inheritance: nested areas take the parent's category, including descendants so a
        // later outdent or Projects-tab group does not resurrect a stale value.
        const inherited = await resultAreaCategory(tx, userId, parentId);
        await applyCategoryToResultAreaSubtree(tx, userId, nodeId, inherited);
      } else if (parentId === null && category !== undefined) {
        await applyCategoryToResultAreaSubtree(tx, userId, nodeId, category);
      }
    }

    // Re-parenting under a shelved project (or out of one) can change whether a plan's day
    // still falls inside an active shelf. Day lines follow the effective shelf, not only the
    // row's own dates — so re-sync the whole moved subtree.
    await syncDayLinesInSubtree(tx, userId, nodeId);
  });
}

/**
 * Writes `category` on `rootId` (must be a result area) and every result area beneath it.
 * Other node types do not carry a category column.
 */
async function applyCategoryToResultAreaSubtree(
  tx: Executor,
  userId: string,
  rootId: string,
  category: string | null,
): Promise<void> {
  // Same trim rule as the detail form: blank means uncategorised, no leading/trailing
  // space that would fork an otherwise identical group label.
  const normalized =
    category === null || category.trim() === "" ? null : category.trim();
  // The subtree first, then one query for the areas in it — rather than a type lookup per
  // node, which was a query per row of a branch that can be the whole outline.
  const subtree = await subtreeIds(tx, userId, rootId);
  const raIds = (
    await tx
      .select({ id: nodes.id })
      .from(nodes)
      .where(
        and(
          eq(nodes.userId, userId),
          eq(nodes.type, "result_area"),
          inArray(nodes.id, subtree),
        ),
      )
  ).map((row) => row.id);

  for (const id of raIds) {
    await tx
      .insert(resultAreaDetails)
      .values({ nodeId: id, category: normalized })
      .onConflictDoUpdate({
        target: resultAreaDetails.nodeId,
        set: { category: normalized },
      });
  }
}

/** Makes a node the last child of its previous sibling. */
export async function indentNode(userId: string, nodeId: string): Promise<void> {
  const node = await requireNode(db, userId, nodeId);
  const siblings = await siblingKeys(db, userId, node.parentId);
  const index = siblings.findIndex((s) => s.id === nodeId);

  if (index <= 0) {
    throw new Error("Nothing to indent under — this is the first item at its level.");
  }

  await moveNode({
    userId,
    nodeId,
    parentId: siblings[index - 1].id,
    position: { at: "last" },
  });
}

/** Makes a node the next sibling of its parent. */
export async function outdentNode(userId: string, nodeId: string): Promise<void> {
  const node = await requireNode(db, userId, nodeId);

  if (node.parentId === null) {
    throw new Error("Already at the top level.");
  }

  const parent = await requireNode(db, userId, node.parentId);

  await moveNode({
    userId,
    nodeId,
    parentId: parent.parentId,
    position: { at: "after", siblingId: parent.id },
  });
}

/** Swaps a node with its previous or next sibling. */
export async function moveNodeVertically(
  userId: string,
  nodeId: string,
  direction: "up" | "down",
): Promise<void> {
  const node = await requireNode(db, userId, nodeId);
  const siblings = await siblingKeys(db, userId, node.parentId);
  const index = siblings.findIndex((s) => s.id === nodeId);

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= siblings.length) {
    return; // Already at the end of its level — a no-op rather than an error.
  }

  await moveNode({
    userId,
    nodeId,
    parentId: node.parentId,
    position: {
      at: direction === "up" ? "before" : "after",
      siblingId: siblings[target].id,
    },
  });
}
