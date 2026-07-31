import { db } from "@/db";
import {
  goalDetails,
  nodes,
  projectDetails,
  resultAreaDetails,
  taskDetails,
} from "@/db/schema";
import type { NodeState, NodeType, PriorityLetter } from "@/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { assertCanNest, TYPE_LABELS } from "./hierarchy";
import { loadOutline } from "./queries";
import { between } from "./sortKey";
import type { Position } from "./types";

/**
 * Every mutation takes a `userId` and scopes on it, so a caller cannot reach another
 * user's rows even by guessing an id. When real auth lands, the id comes from the session
 * instead of `getCurrentUserId()`; nothing here changes.
 */

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

function parentMatches(parentId: string | null) {
  return parentId === null ? isNull(nodes.parentId) : eq(nodes.parentId, parentId);
}

async function requireNode(tx: Executor, userId: string, nodeId: string) {
  const [node] = await tx
    .select()
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .limit(1);

  if (!node) throw new Error(`Node not found: ${nodeId}`);
  return node;
}

/** Sibling sort keys under `parentId`, in order. */
async function siblingKeys(
  tx: Executor,
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
async function sortKeyFor(
  tx: Executor,
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
async function isSelfOrDescendant(
  tx: Executor,
  userId: string,
  nodeId: string,
  candidateId: string | null,
): Promise<boolean> {
  let current = candidateId;
  while (current !== null) {
    if (current === nodeId) return true;
    const [row] = await tx
      .select({ parentId: nodes.parentId })
      .from(nodes)
      .where(and(eq(nodes.id, current), eq(nodes.userId, userId)))
      .limit(1);
    if (!row) return false;
    current = row.parentId;
  }
  return false;
}

export async function createNode(params: {
  userId: string;
  parentId: string | null;
  type: NodeType;
  name?: string;
  /** Body text, so a caller that already has one — quick capture's `##` note — writes once. */
  notes?: string;
  isInbox?: boolean;
  /**
   * Goals only — a Dream is a Goal with this set (see `schema.ts`), and it is settable at
   * creation because the picker asks which one you meant before the row exists. Ignored
   * for every other type, which has nowhere to store it.
   */
  isDream?: boolean;
  position?: Position;
}): Promise<string> {
  const {
    userId,
    parentId,
    type,
    name = "",
    notes = "",
    isInbox = false,
    isDream = false,
    position = { at: "last" },
  } = params;

  return db.transaction(async (tx) => {
    const parentType = parentId ? (await requireNode(tx, userId, parentId)).type : null;
    assertCanNest(type, parentType);

    const sortKey = await sortKeyFor(tx, userId, parentId, position);

    const [created] = await tx
      .insert(nodes)
      .values({ userId, parentId, type, name, notes, isInbox, sortKey })
      .returning({ id: nodes.id });

    // Detail rows are created up front so later edits are plain updates.
    if (type === "task") {
      await tx.insert(taskDetails).values({ nodeId: created.id });
    } else if (type === "result_area") {
      // Categories live only on result areas. A nested area inherits its parent's so
      // outline grouping and the detail form stay aligned with Achieve Planner.
      const category =
        parentType === "result_area" && parentId
          ? await resultAreaCategory(tx, userId, parentId)
          : null;
      await tx.insert(resultAreaDetails).values({ nodeId: created.id, category });
    } else if (type === "project") {
      await tx.insert(projectDetails).values({ nodeId: created.id });
    } else if (type === "goal") {
      await tx.insert(goalDetails).values({ nodeId: created.id, isDream });
    }

    return created.id;
  });
}

/** Deletes a node. Descendants and detail rows cascade. */
export async function deleteNode(userId: string, nodeId: string): Promise<void> {
  await db.delete(nodes).where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
}

export async function renameNode(
  userId: string,
  nodeId: string,
  name: string,
): Promise<void> {
  await db
    .update(nodes)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
}

export async function setPriority(
  userId: string,
  nodeId: string,
  letter: PriorityLetter | null,
  rank: number | null,
): Promise<void> {
  await db
    .update(nodes)
    .set({
      priorityLetter: letter,
      // A rank without a letter is meaningless, so clear it alongside.
      priorityRank: letter === null ? null : rank,
      updatedAt: new Date(),
    })
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
}

export async function setState(
  userId: string,
  nodeId: string,
  state: NodeState,
): Promise<void> {
  await db
    .update(nodes)
    .set({
      state,
      completedAt: state === "completed" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
}

export async function setFocus(
  userId: string,
  nodeId: string,
  focus: boolean,
): Promise<void> {
  await db
    .update(nodes)
    .set({ focus, updatedAt: new Date() })
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
}

export async function setCollapsed(
  userId: string,
  nodeId: string,
  collapsed: boolean,
): Promise<void> {
  await db
    .update(nodes)
    .set({ collapsed, updatedAt: new Date() })
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
}

/**
 * Expand or collapse every row for a user. Leaf rows carry the flag harmlessly; the grid
 * only consults it when `hasChildren` is true.
 *
 * Achieve's Expand All / Collapse All (To Level 1). Prefer this over N single-row writes
 * so a large outline does not fan out into N server actions.
 */
export async function setAllCollapsed(
  userId: string,
  collapsed: boolean,
): Promise<void> {
  await db
    .update(nodes)
    .set({ collapsed, updatedAt: new Date() })
    .where(eq(nodes.userId, userId));
}

/**
 * Show the outline through a maximum depth (0 = roots only).
 *
 * Nodes shallower than `maxDepth` are expanded so their children can appear; nodes at
 * `maxDepth` are collapsed so deeper descendants hide. Matches Achieve's "Expand to Level N"
 * where Level 1 is the top row of result areas.
 */
export async function expandThroughDepth(
  userId: string,
  maxDepth: number,
): Promise<void> {
  const depth = Math.max(0, Math.floor(maxDepth));
  const outline = await loadOutline(userId);

  const expandIds = outline.filter((n) => n.depth < depth).map((n) => n.id);
  const collapseIds = outline.filter((n) => n.depth >= depth).map((n) => n.id);

  if (expandIds.length > 0) {
    await db
      .update(nodes)
      .set({ collapsed: false, updatedAt: new Date() })
      .where(and(eq(nodes.userId, userId), inArray(nodes.id, expandIds)));
  }
  if (collapseIds.length > 0) {
    await db
      .update(nodes)
      .set({ collapsed: true, updatedAt: new Date() })
      .where(and(eq(nodes.userId, userId), inArray(nodes.id, collapseIds)));
  }
}

/**
 * Sets a task's effort estimate, in minutes. Passing null clears it.
 *
 * Only tasks carry an estimate — a project's effort is the rollup of its tasks, computed at
 * read time and never stored, so writing one would be silently discarded.
 */
export async function setEffort(
  userId: string,
  nodeId: string,
  minutes: number | null,
): Promise<void> {
  const node = await requireNode(db, userId, nodeId);

  if (node.type !== "task") {
    throw new Error(
      `Effort is only tracked on tasks. A ${TYPE_LABELS[node.type]} shows the total of everything below it.`,
    );
  }

  const [existing] = await db
    .select({ effortLeftMinutes: taskDetails.effortLeftMinutes })
    .from(taskDetails)
    .where(eq(taskDetails.nodeId, nodeId))
    .limit(1);

  // Effort Left starts equal to Effort and diverges as work is recorded, so it is seeded
  // on the first estimate and left alone afterwards. Clearing the estimate clears both.
  const effortLeftMinutes =
    minutes === null ? null : (existing?.effortLeftMinutes ?? minutes);

  await db
    .insert(taskDetails)
    .values({ nodeId, effortMinutes: minutes, effortLeftMinutes })
    .onConflictDoUpdate({
      target: taskDetails.nodeId,
      set: { effortMinutes: minutes, effortLeftMinutes },
    });
}

export async function setDeadline(
  userId: string,
  nodeId: string,
  deadline: Date | null,
): Promise<void> {
  await db
    .update(nodes)
    .set({ deadline, updatedAt: new Date() })
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
}

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
}): Promise<void> {
  const { userId, nodeId, parentId, position, category } = params;

  await db.transaction(async (tx) => {
    const node = await requireNode(tx, userId, nodeId);

    if (await isSelfOrDescendant(tx, userId, nodeId, parentId)) {
      throw new Error("A node cannot be moved inside itself.");
    }

    const parentType = parentId ? (await requireNode(tx, userId, parentId)).type : null;
    assertCanNest(node.type, parentType);

    const sortKey = await sortKeyFor(tx, userId, parentId, position, nodeId);

    await tx
      .update(nodes)
      .set({ parentId, sortKey, updatedAt: new Date() })
      .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));

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
  });
}

/** Stored category on a result area, or null when missing / blank is not applied. */
async function resultAreaCategory(
  tx: Executor,
  userId: string,
  nodeId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ category: resultAreaDetails.category })
    .from(resultAreaDetails)
    .innerJoin(nodes, eq(nodes.id, resultAreaDetails.nodeId))
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .limit(1);
  return row?.category ?? null;
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
  const raIds: string[] = [];
  const queue = [rootId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const [row] = await tx
      .select({ type: nodes.type })
      .from(nodes)
      .where(and(eq(nodes.id, id), eq(nodes.userId, userId)))
      .limit(1);
    if (!row) continue;
    if (row.type === "result_area") raIds.push(id);

    const children = await tx
      .select({ id: nodes.id })
      .from(nodes)
      .where(and(eq(nodes.userId, userId), eq(nodes.parentId, id)));
    for (const child of children) queue.push(child.id);
  }

  for (const id of raIds) {
    await tx
      .insert(resultAreaDetails)
      .values({ nodeId: id, category })
      .onConflictDoUpdate({
        target: resultAreaDetails.nodeId,
        set: { category },
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

  await db.transaction(async (tx) => {
    for (const assignment of assignments) {
      await tx
        .update(nodes)
        .set({
          tcPriorityLetter: assignment.letter,
          // A rank without a letter would be unorderable, so it never survives alone.
          tcPriorityRank: assignment.letter === null ? null : assignment.rank,
          updatedAt: new Date(),
        })
        .where(and(eq(nodes.id, assignment.nodeId), eq(nodes.userId, userId)));
    }
  });
}
