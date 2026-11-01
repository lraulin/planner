import { and, asc, eq, isNull, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { DbExecutor } from "@/db/executor";
import { ownedParentOf } from "@/lib/db/owned";
import { isSelfOrDescendantVia } from "./ancestry";
import { keyAtPosition, type SiblingKey } from "./siblingOrder";
import type { Position } from "./types";

/** A user's ordered, collapsible tree stored one row per item — outline nodes, notes. */
type TreeTable = PgTable & {
  id: AnyPgColumn;
  userId: AnyPgColumn;
  parentId: AnyPgColumn;
  sortKey: AnyPgColumn;
  collapsed: AnyPgColumn;
  updatedAt: AnyPgColumn;
};

/**
 * The row reads and writes every insert, move and nest on a tree table starts from. Outline
 * nodes and notes each carried a copy; where a row lands among its siblings, and whether a
 * move would put a row inside itself, are properties of the tree, not of what its rows hold.
 *
 * Every function scopes on `userId`, so another user's id is simply not found.
 */
export function treeTableRows(table: TreeTable) {
  // Drizzle cannot type `.from()` or `.update()` over a generic table, so the queries read it
  // as a plain `PgTable` and check what comes back (as `lib/db/owned.ts` does).
  const source: PgTable = table;

  function parentMatches(parentId: string | null): SQL {
    return parentId === null ? isNull(table.parentId) : eq(table.parentId, parentId);
  }

  /**
   * Open a parent so a newly nested child is actually on screen. Collapse is stored on the
   * row, and Collapse All stamps the flag onto leaves too, so a first child under a
   * previously-empty row would otherwise appear and immediately hide.
   *
   * No-op when `parentId` is null or the parent is already expanded — the `collapsed = true`
   * predicate keeps `updatedAt` still when there is nothing to change.
   */
  async function expandParent(
    tx: DbExecutor,
    userId: string,
    parentId: string | null,
  ): Promise<void> {
    if (parentId === null) return;
    await tx
      .update(source)
      .set({ collapsed: false, updatedAt: new Date() })
      .where(
        and(
          eq(table.id, parentId),
          eq(table.userId, userId),
          eq(table.collapsed, true),
        ),
      );
  }

  /** Sibling sort keys under `parentId`, in order. */
  async function siblingKeys(
    tx: DbExecutor,
    userId: string,
    parentId: string | null,
  ): Promise<SiblingKey[]> {
    const rows = await tx
      .select({ id: table.id, sortKey: table.sortKey })
      .from(source)
      .where(and(eq(table.userId, userId), parentMatches(parentId)))
      .orderBy(asc(table.sortKey));
    return rows.map((row) => {
      if (typeof row.id !== "string" || typeof row.sortKey !== "string") {
        throw new Error("A tree row's id or sort key is not a string.");
      }
      return { id: row.id, sortKey: row.sortKey };
    });
  }

  /**
   * Resolves a `Position` into a sort key, ignoring `excludeId` so a row being moved within
   * its current parent does not treat itself as a neighbour.
   */
  async function sortKeyFor(
    tx: DbExecutor,
    userId: string,
    parentId: string | null,
    position: Position,
    excludeId?: string,
  ): Promise<string> {
    return keyAtPosition(await siblingKeys(tx, userId, parentId), position, excludeId);
  }

  /** True when `candidateId` is `id` itself or sits somewhere beneath it. */
  async function isSelfOrDescendant(
    tx: DbExecutor,
    userId: string,
    id: string,
    candidateId: string | null,
  ): Promise<boolean> {
    return isSelfOrDescendantVia(id, candidateId, ownedParentOf(tx, table, userId));
  }

  return { parentMatches, expandParent, siblingKeys, sortKeyFor, isSelfOrDescendant };
}
