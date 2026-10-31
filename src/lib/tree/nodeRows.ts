import type { DbExecutor } from "@/db/executor";
import { nodes, resultAreaDetails } from "@/db/schema";
import { ownedRow, requireOwnedRow } from "@/lib/db/owned";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { between } from "./sortKey";
import type { Position } from "./types";
import { isSelfOrDescendantVia, subtreeIdsVia } from "./ancestry";

/**
 * The reads every outline write starts from: a node proven to be the caller's, its siblings
 * and where a new one sorts among them, its subtree, and a Result Area's category. Each
 * scopes on `userId`, so a guessed id from another user's outline is simply not found.
 */

export function parentMatches(parentId: string | null) {
  return parentId === null ? isNull(nodes.parentId) : eq(nodes.parentId, parentId);
}

export async function requireNode(tx: DbExecutor, userId: string, nodeId: string) {
  return requireOwnedRow(tx, nodes, nodeId, userId, `Node not found: ${nodeId}`);
}

/**
 * Open a parent so a newly nested child is actually on screen. Collapse is stored on the
 * row, and Collapse All stamps the flag onto leaves too, so a first child under a
 * previously-empty row would otherwise appear and immediately hide.
 *
 * No-op when `parentId` is null or the parent is already expanded — the `collapsed = true`
 * predicate keeps `updatedAt` still when there is nothing to change.
 */
export async function expandParent(
  tx: DbExecutor,
  userId: string,
  parentId: string | null,
): Promise<void> {
  if (parentId === null) return;
  await tx
    .update(nodes)
    .set({ collapsed: false, updatedAt: new Date() })
    .where(
      and(eq(nodes.id, parentId), eq(nodes.userId, userId), eq(nodes.collapsed, true)),
    );
}

/** Sibling sort keys under `parentId`, in order. */
export async function siblingKeys(
  tx: DbExecutor,
  userId: string,
  parentId: string | null,
): Promise<{ id: string; sortKey: string }[]> {
  return tx
    .select({ id: nodes.id, sortKey: nodes.sortKey })
    .from(nodes)
    .where(and(eq(nodes.userId, userId), parentMatches(parentId)))
    .orderBy(asc(nodes.sortKey));
}

/**
 * Resolves a `Position` into a sort key, ignoring `excludeId` so that a node being moved
 * within its current parent does not treat itself as a neighbour.
 */
export async function sortKeyFor(
  tx: DbExecutor,
  userId: string,
  parentId: string | null,
  position: Position,
  excludeId?: string,
): Promise<string> {
  const siblings = (await siblingKeys(tx, userId, parentId)).filter(
    (s) => s.id !== excludeId,
  );

  switch (position.at) {
    case "first":
      return between(null, siblings[0]?.sortKey ?? null);
    case "last":
      return between(siblings[siblings.length - 1]?.sortKey ?? null, null);
    case "before": {
      const index = siblings.findIndex((s) => s.id === position.siblingId);
      if (index === -1) throw new Error(`Sibling not found: ${position.siblingId}`);
      return between(siblings[index - 1]?.sortKey ?? null, siblings[index].sortKey);
    }
    case "after": {
      const index = siblings.findIndex((s) => s.id === position.siblingId);
      if (index === -1) throw new Error(`Sibling not found: ${position.siblingId}`);
      return between(siblings[index].sortKey, siblings[index + 1]?.sortKey ?? null);
    }
  }
}

/** True when `candidateId` is `nodeId` itself or sits somewhere beneath it. */
export async function isSelfOrDescendant(
  tx: DbExecutor,
  userId: string,
  nodeId: string,
  candidateId: string | null,
): Promise<boolean> {
  return isSelfOrDescendantVia(nodeId, candidateId, async (id) => {
    const [row] = await tx
      .select({ parentId: nodes.parentId })
      .from(nodes)
      .where(ownedRow(nodes, id, userId))
      .limit(1);
    return row?.parentId;
  });
}

/**
 * Node ids at or beneath `rootId`, breadth-first. Root included.
 *
 * One query per level rather than per node — a recurring checklist is shallow and wide,
 * which is the shape this is walked in.
 */
export async function subtreeIds(
  tx: DbExecutor,
  userId: string,
  rootId: string,
): Promise<string[]> {
  return subtreeIdsVia(rootId, (frontier) =>
    tx
      .select({ id: nodes.id })
      .from(nodes)
      .where(and(eq(nodes.userId, userId), inArray(nodes.parentId, [...frontier]))),
  );
}

/** Stored category on a result area, or null when missing / blank is not applied. */
export async function resultAreaCategory(
  tx: DbExecutor,
  userId: string,
  nodeId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ category: resultAreaDetails.category })
    .from(resultAreaDetails)
    .innerJoin(nodes, eq(nodes.id, resultAreaDetails.nodeId))
    .where(ownedRow(nodes, nodeId, userId))
    .limit(1);
  return row?.category ?? null;
}
