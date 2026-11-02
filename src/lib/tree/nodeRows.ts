import type { DbExecutor } from "@/db/executor";
import { nodes, resultAreaDetails } from "@/db/schema";
import { ownedRow, requireOwnedRow } from "@/lib/db/owned";
import { and, eq, inArray } from "drizzle-orm";
import { subtreeIdsVia } from "./ancestry";
import { treeTableRows } from "./treeTableRows";

/**
 * The reads every outline write starts from: a node proven to be the caller's, its siblings
 * and where a new one sorts among them, its subtree, and a Result Area's category. Each
 * scopes on `userId`, so a guessed id from another user's outline is simply not found.
 */

export const {
  parentMatches,
  expandParent,
  siblingKeys,
  sortKeyFor,
  isSelfOrDescendant,
  setAllCollapsed: setAllNodesCollapsed,
} = treeTableRows(nodes);

export async function requireNode(tx: DbExecutor, userId: string, nodeId: string) {
  return requireOwnedRow(tx, nodes, nodeId, userId, `Node not found: ${nodeId}`);
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
