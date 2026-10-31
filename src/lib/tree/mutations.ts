import { db } from "@/db";
import {
  goalDetails,
  nodeItems,
  nodes,
  projectDetails,
  resultAreaDetails,
  taskCompletions,
  taskDetails,
} from "@/db/schema";
import { findByExternalRef, ownedRow } from "@/lib/db/owned";
import type { ExternalRef, NodeType } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { asCalendarDay } from "@/lib/schedule/geometry";
import { clearOpenDayLinesForNode, syncDayLinesInSubtree } from "@/lib/day/sync";
import {
  assertCanNest,
  kindOfNode,
  TYPE_LABELS,
  nodeFromKind,
  type NodeKind,
} from "./hierarchy";
import { planNodeConversion } from "./conversion";
import { promoteUrlsFromTaskName } from "@/lib/url/taskNameLinks";
import { loadOutline } from "./queries";
import { rearmReminders, supersedeOrphanedReminders } from "@/lib/reminders/arm";
import { autoReminderUpdate, writeReminder } from "@/lib/reminders/autoReminder";
import type { Position } from "./types";
import { initialStateForType } from "./lifecycle";
import { expandParent, requireNode, resultAreaCategory, sortKeyFor } from "./nodeRows";

/**
 * Every mutation takes a `userId` and scopes on it, so a caller cannot reach another
 * user's rows even by guessing an id. When real auth lands, the id comes from the session
 * instead of `getCurrentUserId()`; nothing here changes.
 *
 * This file creates, renames, deletes and converts nodes and writes their plain fields. The
 * rest of the outline's writes sit beside it, one per reason to change: state and completion
 * (`stateTransitions.ts`), recurrence cycling (`recurrenceCycle.ts`), priorities
 * (`priorityWrites.ts`), and moves (`nodeMoves.ts`).
 */

export type CreateNodeParams = {
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
  /**
   * Provenance, for rows imported from outside the app. One object rather than two loose
   * strings so an id can never arrive without the source that qualifies it — the unique
   * index in `schema.ts` treats a null source as distinct, so that pairing is an
   * invariant the type system should be keeping, not a convention.
   */
  external?: ExternalRef;
  position?: Position;
};

export type CreateOnceResult = { id: string; created: boolean };

export async function createNode(params: CreateNodeParams): Promise<string> {
  return (await createNodeOnce(params)).id;
}

/**
 * Create once by the optional per-user external reference.
 *
 * The pre-read gives ordinary retries the cheap path; conflict-do-nothing plus a second
 * read closes the race where two deliveries first arrive together. A replay returns before
 * parent/detail validation so it cannot mutate or reject an item that has since been filed.
 */
export async function createNodeOnce(
  params: CreateNodeParams,
): Promise<CreateOnceResult> {
  const {
    userId,
    parentId,
    type,
    name = "",
    notes = "",
    isInbox = false,
    isDream = false,
    external,
    position = { at: "last" },
  } = params;

  // Network title fetch must not run inside the insert transaction.
  const result = await db.transaction(async (tx): Promise<CreateOnceResult> => {
    if (external) {
      const existing = await findByExternalRef(tx, nodes, userId, external);
      if (existing) return { id: existing.id, created: false };
    }

    const parentType = parentId ? (await requireNode(tx, userId, parentId)).type : null;
    assertCanNest(type, parentType);

    const sortKey = await sortKeyFor(tx, userId, parentId, position);

    const [created] = await tx
      .insert(nodes)
      .values({
        userId,
        parentId,
        type,
        state: initialStateForType(type),
        name,
        notes,
        isInbox,
        sortKey,
        externalSource: external?.source ?? null,
        externalId: external?.id ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: nodes.id });

    if (!created) {
      if (!external) throw new Error("Node could not be created.");
      const existing = await findByExternalRef(tx, nodes, userId, external);
      if (!existing) throw new Error("Node could not be created.");
      return { id: existing.id, created: false };
    }

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

    await expandParent(tx, userId, parentId);

    return { id: created.id, created: true };
  });

  // Capture, agent create, and any create-with-name path: URLs in a task name become
  // attachments and the name is rewritten to page titles when fetch succeeds.
  if (result.created && type === "task" && name.trim()) {
    await promoteUrlsFromTaskName(userId, result.id);
  }

  return result;
}

/**
 * Deletes a node. Descendants and detail rows cascade — and so do their reminders, which
 * have no foreign key to cascade through, so they are closed by a sweep afterwards.
 */
export async function deleteNode(userId: string, nodeId: string): Promise<void> {
  await db.delete(nodes).where(ownedRow(nodes, nodeId, userId));
  await supersedeOrphanedReminders(userId);
}

export async function renameNode(
  userId: string,
  nodeId: string,
  name: string,
): Promise<void> {
  await db
    .update(nodes)
    .set({ name, updatedAt: new Date() })
    .where(ownedRow(nodes, nodeId, userId));
  // Outline create is blank-then-rename; promote is a no-op for non-tasks and URL-free names.
  await promoteUrlsFromTaskName(userId, nodeId);
}

/**
 * Change a node's stored type without changing its id. The preview/planner owns legal
 * placement and descendant checks; this transaction owns detail-row replacement and the
 * user-scoped writes.
 */
export async function convertNode(
  userId: string,
  nodeId: string,
  targetKind: NodeKind,
): Promise<void> {
  await db.transaction(async (tx) => {
    const source = await requireNode(tx, userId, nodeId);
    const sourceKind =
      source.type === "goal"
        ? kindOfNode({
            type: source.type,
            isDream: (
              await tx
                .select({ isDream: goalDetails.isDream })
                .from(goalDetails)
                .where(eq(goalDetails.nodeId, nodeId))
                .limit(1)
            )[0]?.isDream,
          })
        : source.type;

    // Converting a row to the kind it already is has nothing to do — and must not fall
    // through, because the detail tables are keyed by `nodeId` and the branch below would
    // insert a second row for one that already exists.
    if (sourceKind === targetKind) return;

    const tree = await tx
      .select({
        id: nodes.id,
        parentId: nodes.parentId,
        type: nodes.type,
        name: nodes.name,
        sortKey: nodes.sortKey,
      })
      .from(nodes)
      .where(eq(nodes.userId, userId));
    const plan = planNodeConversion({
      nodeId,
      sourceKind,
      targetKind,
      nodes: tree,
    });
    if (plan.descendantConflicts.length > 0) {
      throw new Error(
        `Cannot convert while these children are under it: ${plan.descendantConflicts
          .map((child) => child.name)
          .join(", ")}. Convert or move them first.`,
      );
    }

    const { type: targetType, isDream } = nodeFromKind(targetKind);
    const placement = plan.placement;
    let sortKey = source.sortKey;
    if (placement.position) {
      sortKey = await sortKeyFor(
        tx,
        userId,
        placement.parentId,
        placement.position,
        nodeId,
      );
    }

    if (source.type !== targetType) {
      await tx.delete(resultAreaDetails).where(eq(resultAreaDetails.nodeId, nodeId));
      await tx.delete(goalDetails).where(eq(goalDetails.nodeId, nodeId));
      await tx.delete(projectDetails).where(eq(projectDetails.nodeId, nodeId));
      await tx.delete(taskDetails).where(eq(taskDetails.nodeId, nodeId));
      await tx
        .delete(taskCompletions)
        .where(
          and(eq(taskCompletions.userId, userId), eq(taskCompletions.nodeId, nodeId)),
        );
      // Repeating lists are type-specific. Keeping them after a conversion would make a
      // Project appear to have stale Task/Goal questions in its drawer.
      await tx
        .delete(nodeItems)
        .where(and(eq(nodeItems.userId, userId), eq(nodeItems.nodeId, nodeId)));
    }

    // Lifecycle only moves when a Result Area is on one side of the conversion, which is
    // exactly what `planNodeConversion` tells the user: it lists state, deferred date and
    // completion time under `discardedFields` when the target is a Result Area, under
    // `retainedFields` otherwise, and the dialog warns only in the first case. Resetting
    // unconditionally un-completed a finished Goal on its way to a Dream — a conversion
    // described as discarding nothing — and un-shelved a postponed task that became a
    // project, which `deferred_date` moved onto `nodes` specifically to allow.
    const lifecycle =
      targetType === "result_area"
        ? { state: null, completedAt: null, deferredDate: null }
        : source.type === "result_area"
          ? { state: initialStateForType(targetType), completedAt: null }
          : {};

    await tx
      .update(nodes)
      .set({
        type: targetType,
        ...lifecycle,
        parentId: placement.parentId,
        sortKey,
        updatedAt: new Date(),
      })
      .where(ownedRow(nodes, nodeId, userId));

    if (targetType === "goal") {
      if (source.type === "goal") {
        await tx
          .update(goalDetails)
          .set({ isDream })
          .where(eq(goalDetails.nodeId, nodeId));
      } else {
        await tx.insert(goalDetails).values({ nodeId, isDream });
      }
    } else if (targetType === "result_area") {
      await tx.insert(resultAreaDetails).values({ nodeId, category: null });
    } else if (targetType === "project") {
      await tx.insert(projectDetails).values({ nodeId });
    } else {
      await tx.insert(taskDetails).values({ nodeId });
    }

    // A day page holds tasks. Leaving `task` without clearing open lines would list a
    // Project (or Goal) among the day's work — `syncDayLineToTargetStart` only acts on
    // tasks, so it cannot clean up the residue. Settled history is left alone.
    if (source.type === "task" && targetType !== "task") {
      await clearOpenDayLinesForNode(tx, userId, nodeId);
    }
    await syncDayLinesInSubtree(tx, userId, nodeId);
  });
}

export async function setFocus(
  userId: string,
  nodeId: string,
  focus: boolean,
): Promise<void> {
  await db
    .update(nodes)
    .set({ focus, updatedAt: new Date() })
    .where(ownedRow(nodes, nodeId, userId));
}

export async function setCollapsed(
  userId: string,
  nodeId: string,
  collapsed: boolean,
): Promise<void> {
  await db
    .update(nodes)
    .set({ collapsed, updatedAt: new Date() })
    .where(ownedRow(nodes, nodeId, userId));
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
 * `maxDepth` are collapsed so deeper descendants hide.
 *
 * `maxDepth` is the tree's own **0-based** `depth`, not Achieve's 1-based outline Level —
 * "Expand to Level 1" is the top row of result areas, which is `maxDepth` 0. Callers
 * showing a Level to the user convert with `depthForOutlineLevel`.
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

/**
 * Set a deadline, and with it Achieve's auto-set reminder (`autoReminderUpdate`) when the
 * reminder is empty or still the one the old deadline set.
 */
export async function setDeadline(
  userId: string,
  nodeId: string,
  deadline: Date | null,
): Promise<void> {
  const nextDeadline = deadline ? asCalendarDay(deadline) : null;
  let type: NodeType | undefined;
  await db.transaction(async (tx) => {
    const [node] = await tx
      .select({ id: nodes.id, type: nodes.type, deadline: nodes.deadline })
      .from(nodes)
      .where(ownedRow(nodes, nodeId, userId))
      .limit(1);
    // A missing or foreign id is a no-op here, as for the module's other plain writes.
    if (!node) return;
    type = node.type;
    const reminder = await autoReminderUpdate(tx, userId, node, nextDeadline);
    await tx
      .update(nodes)
      .set({ deadline: nextDeadline, updatedAt: new Date() })
      .where(ownedRow(nodes, nodeId, userId));
    if (reminder !== undefined && (node.type === "task" || node.type === "project")) {
      await writeReminder(tx, { id: nodeId, type: node.type }, reminder);
    }
  });
  if (type === "task" || type === "project") {
    await rearmReminders(userId, [{ kind: "node", id: nodeId }]);
  }
}
