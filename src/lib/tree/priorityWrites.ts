import { db } from "@/db";
import { nodes } from "@/db/schema";
import { ownedRow } from "@/lib/db/owned";
import type { NodeState, PriorityLetter } from "@/db/schema";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { assertRankedLetterPriorities } from "@/lib/priority/letterRank";
import { planTcClear } from "@/lib/chooser/tcPriority";
import { priorityFieldsToClearOnSettle } from "@/lib/priority/settle";
import {
  planOutlinePriorityAssign,
  planOutlinePriorityClear,
  type PriorityNode,
} from "./outlinePriority";
import type { DbExecutor } from "@/db/executor";
import { parentMatches, requireNode } from "./nodeRows";

/**
 * Writes for outline and Task Chooser priorities. The ranking rules live in the pure
 * planners (`outlinePriority.ts`, `lib/chooser/tcPriority.ts`); this only loads the pools
 * and persists their answer, every statement scoped by `userId`.
 */

/**
 * One parent's complete child set, in outline order, as the ranking engine wants it.
 *
 * Deliberately reads every child rather than the rows a grid happens to be showing: a
 * renumber that only accounted for visible rows would silently collapse the ranks of
 * everything a filter had hidden.
 */
export async function siblingPriorityPool(
  tx: DbExecutor,
  userId: string,
  parentId: string | null,
): Promise<PriorityNode[]> {
  return tx
    .select({
      id: nodes.id,
      parentId: nodes.parentId,
      priorityLetter: nodes.priorityLetter,
      priorityRank: nodes.priorityRank,
    })
    .from(nodes)
    .where(and(eq(nodes.userId, userId), parentMatches(parentId)))
    .orderBy(asc(nodes.sortKey));
}

/**
 * Set one node's priority, normalising its whole sibling group.
 *
 * A node's priority is either blank or an A-D letter **with a rank** — there is no bare
 * letter — and within one parent and letter the ranks are dense `1..n` with no ties. That
 * invariant cannot be maintained one row at a time, so this does not write the letter and
 * rank it was handed: it asks the shared ranking engine where the node lands among its
 * siblings and writes every row the answer moves.
 *
 * So `A` appends to the end of A, `A1` inserts and pushes the rest down, a rank past the end
 * clamps, and clearing closes the gap. See `lib/tree/outlinePriority`.
 */
export async function setPriority(
  userId: string,
  nodeId: string,
  letter: PriorityLetter | null,
  rank: number | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    const node = await requireNode(tx, userId, nodeId);
    await assignPriorityAmongSiblings(tx, userId, nodeId, node.parentId, letter, rank);
  });
}

/**
 * Give one priority to a whole selection, so a long list can be ranked in one action.
 *
 * The rank is a *request*, answered per sibling group: `A1` puts the block at the top of A
 * and pushes the rest down, `A10` inserts at ten, a rank past the end clamps to the end, a
 * bare letter appends, and blank unprioritizes. Within each group the block takes
 * consecutive ranks.
 *
 * **Ordered by `sortKey`, not by the order the rows were clicked or are currently sorted.**
 * The point of the command is to make rank agree with the outline — a series of videos
 * ranked in the order they are meant to be watched — so reading the order off a grid that
 * might be sorted by name would defeat it.
 *
 * A selection may span parents. Priority is sibling-relative, so each parent is ranked as
 * its own group and the same letter can legitimately produce an `A1` in each.
 */
export async function setPriorityForNodes(
  userId: string,
  nodeIds: readonly string[],
  letter: PriorityLetter | null,
  rank: number | null,
): Promise<void> {
  if (nodeIds.length === 0) return;

  await db.transaction(async (tx) => {
    const selected = await tx
      .select({ id: nodes.id, parentId: nodes.parentId, sortKey: nodes.sortKey })
      .from(nodes)
      .where(and(eq(nodes.userId, userId), inArray(nodes.id, [...nodeIds])))
      .orderBy(asc(nodes.sortKey));

    const byParent = new Map<string | null, string[]>();
    for (const row of selected) {
      const group = byParent.get(row.parentId);
      if (group) group.push(row.id);
      else byParent.set(row.parentId, [row.id]);
    }

    for (const [parentId, ids] of byParent) {
      const siblings = await siblingPriorityPool(tx, userId, parentId);
      await applyPriorityAssignments(
        tx,
        userId,
        planOutlinePriorityAssign(siblings, ids, letter, rank),
      );
    }
  });
}

/**
 * The same assignment inside a transaction the caller already owns.
 *
 * Exists so the drawer's detail save shares one implementation with the grid's inline edit
 * rather than writing the letter and rank verbatim — two paths that disagreed about what
 * `A1` means would break the invariant from whichever side nobody was testing.
 */
export async function assignPriorityAmongSiblings(
  tx: DbExecutor,
  userId: string,
  nodeId: string,
  parentId: string | null,
  letter: PriorityLetter | null,
  rank: number | null,
): Promise<void> {
  const siblings = await siblingPriorityPool(tx, userId, parentId);
  await applyPriorityAssignments(
    tx,
    userId,
    planOutlinePriorityAssign(siblings, nodeId, letter, rank),
  );
}

export async function applyPriorityAssignments(
  tx: DbExecutor,
  userId: string,
  assignments: { id: string; letter: PriorityLetter | null; rank: number | null }[],
): Promise<void> {
  for (const assignment of assignments) {
    await tx
      .update(nodes)
      .set({
        priorityLetter: assignment.letter,
        priorityRank: assignment.letter === null ? null : assignment.rank,
        updatedAt: new Date(),
      })
      .where(ownedRow(nodes, assignment.id, userId));
  }
}

/**
 * Drop a settled node out of outline and/or TC ranking, densifying the letter it left.
 *
 * Runs inside the caller's transaction, after the state write, so recurrence has already
 * decided cycle vs finish. The policy lives in `lib/priority/settle`; this only loads the
 * pools and persists `planClear`.
 */
export async function applySettlePriorityClear(
  tx: DbExecutor,
  userId: string,
  nodeId: string,
  requested: NodeState,
  cycles: boolean,
): Promise<void> {
  const clear = priorityFieldsToClearOnSettle({ requested, cycles });
  if (!clear.outline && !clear.tc) return;

  if (clear.outline) {
    const [node] = await tx
      .select({ parentId: nodes.parentId })
      .from(nodes)
      .where(ownedRow(nodes, nodeId, userId))
      .limit(1);
    if (node) {
      const siblings = await siblingPriorityPool(tx, userId, node.parentId);
      await applyPriorityAssignments(
        tx,
        userId,
        planOutlinePriorityClear(siblings, nodeId),
      );
    }
  }

  if (clear.tc) {
    const ranked = await tx
      .select({
        id: nodes.id,
        tcPriorityLetter: nodes.tcPriorityLetter,
        tcPriorityRank: nodes.tcPriorityRank,
      })
      .from(nodes)
      .where(and(eq(nodes.userId, userId), isNotNull(nodes.tcPriorityLetter)));
    await applyTcAssignments(tx, userId, planTcClear(ranked, nodeId));
  }
}

/**
 * Write a batch of Task Chooser priorities in one transaction.
 *
 * Batched because a single drag renumbers a whole letter group: applying those one at a
 * time would leave the ranking briefly duplicated or gapped, and a failure halfway would
 * leave it that way for good.
 *
 * The plan comes from `src/lib/chooser/tcPriority.ts`, which owns the dense-rank rules.
 * This function only persists — it does not re-derive positions, so the pure logic stays
 * the single place the ordering is decided.
 *
 * Every statement is scoped by `userId`, so a plan naming another user's node writes
 * nothing rather than reaching across the fence.
 */
export async function setTcPriorities(
  userId: string,
  assignments: {
    nodeId: string;
    letter: PriorityLetter | null;
    rank: number | null;
  }[],
): Promise<void> {
  if (assignments.length === 0) return;
  assertRankedLetterPriorities(assignments);

  await db.transaction(async (tx) => {
    await applyTcAssignments(tx, userId, assignments);
  });
}

/** Persist TC assignments inside a transaction the caller already owns. */
async function applyTcAssignments(
  tx: DbExecutor,
  userId: string,
  assignments: {
    nodeId: string;
    letter: PriorityLetter | null;
    rank: number | null;
  }[],
): Promise<void> {
  for (const assignment of assignments) {
    await tx
      .update(nodes)
      .set({
        tcPriorityLetter: assignment.letter,
        tcPriorityRank: assignment.rank,
        updatedAt: new Date(),
      })
      .where(ownedRow(nodes, assignment.nodeId, userId));
  }
}
