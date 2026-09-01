import { db } from "@/db";
import {
  dailyItems,
  goalDetails,
  nodeItems,
  nodes,
  projectDetails,
  resultAreaDetails,
  taskCompletions,
  taskDetails,
} from "@/db/schema";
import type { ExternalRef, NodeState, NodeType, PriorityLetter } from "@/db/schema";
import { and, asc, count, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { addDays, daysBetween } from "@/lib/dateMath";
import { nextDue } from "@/lib/recurrence/nextDue";
import { nextOccurrence } from "@/lib/recurrence/pattern";
import {
  asCalendarDay,
  fromDateKey,
  localDateKey,
  toDateKey,
} from "@/lib/schedule/geometry";
import {
  clearConflictingDescendantPlans,
  clearOpenDayLinesForNode,
  syncDayLineToTargetStart,
  syncDayLinesInSubtree,
} from "@/lib/day/sync";
import { cascadeStateChange, type CascadeNode } from "./completionCascade";
import {
  assertCanNest,
  kindOfNode,
  TYPE_LABELS,
  nodeFromKind,
  type NodeKind,
} from "./hierarchy";
import { planNodeConversion } from "./conversion";
import { assertRankedLetterPriorities } from "@/lib/priority/letterRank";
import { planTcClear } from "@/lib/chooser/tcPriority";
import { priorityFieldsToClearOnSettle } from "@/lib/priority/settle";
import {
  planOutlinePriorityAssign,
  planOutlinePriorityClear,
  planOutlinePriorityMove,
  type PriorityNode,
} from "./outlinePriority";
import type { LetterDropZone } from "@/lib/priority/letterRank";
import { promoteUrlsFromTaskName } from "@/lib/url/taskNameLinks";
import { loadOutline } from "./queries";
import { between } from "./sortKey";
import type { Position } from "./types";
import { assertSupportsLifecycleState, initialStateForType } from "./lifecycle";

/**
 * Every mutation takes a `userId` and scopes on it, so a caller cannot reach another
 * user's rows even by guessing an id. When real auth lands, the id comes from the session
 * instead of `getCurrentUserId()`; nothing here changes.
 */

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Executor = Db | Tx;

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

/**
 * Open a parent so a newly nested child is actually on screen. Collapse is stored on the
 * row, and Collapse All stamps the flag onto leaves too, so a first child under a
 * previously-empty row would otherwise appear and immediately hide.
 *
 * No-op when `parentId` is null or the parent is already expanded — the `collapsed = true`
 * predicate keeps `updatedAt` still when there is nothing to change.
 */
async function expandParent(
  tx: Executor,
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
      const [existing] = await tx
        .select({ id: nodes.id })
        .from(nodes)
        .where(
          and(
            eq(nodes.userId, userId),
            eq(nodes.externalSource, external.source),
            eq(nodes.externalId, external.id),
          ),
        )
        .limit(1);
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
      const [existing] = await tx
        .select({ id: nodes.id })
        .from(nodes)
        .where(
          and(
            eq(nodes.userId, userId),
            eq(nodes.externalSource, external.source),
            eq(nodes.externalId, external.id),
          ),
        )
        .limit(1);
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
  // Outline create is blank-then-rename; promote is a no-op for non-tasks and URL-free names.
  await promoteUrlsFromTaskName(userId, nodeId);
}

/**
 * One parent's complete child set, in outline order, as the ranking engine wants it.
 *
 * Deliberately reads every child rather than the rows a grid happens to be showing: a
 * renumber that only accounted for visible rows would silently collapse the ranks of
 * everything a filter had hidden.
 */
async function siblingPriorityPool(
  tx: Executor,
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
  tx: Executor,
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

async function applyPriorityAssignments(
  tx: Executor,
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
      .where(and(eq(nodes.userId, userId), eq(nodes.id, assignment.id)));
  }
}

/**
 * Drop a settled node out of outline and/or TC ranking, densifying the letter it left.
 *
 * Runs inside the caller's transaction, after the state write, so recurrence has already
 * decided cycle vs finish. The policy lives in `lib/priority/settle`; this only loads the
 * pools and persists `planClear`.
 */
async function applySettlePriorityClear(
  tx: Executor,
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
      .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
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

    await tx
      .update(nodes)
      .set({
        type: targetType,
        state: initialStateForType(targetType),
        completedAt: null,
        deferredDate: null,
        parentId: placement.parentId,
        sortKey,
        updatedAt: new Date(),
      })
      .where(and(eq(nodes.userId, userId), eq(nodes.id, nodeId)));

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

/**
 * Node ids at or beneath `rootId`, breadth-first. Root included.
 *
 * One query per level rather than per node — a recurring checklist is shallow and wide,
 * which is the shape this is walked in.
 */
async function subtreeIds(
  tx: Executor,
  userId: string,
  rootId: string,
): Promise<string[]> {
  const ids = [rootId];
  let frontier = [rootId];

  while (frontier.length > 0) {
    const children = await tx
      .select({ id: nodes.id })
      .from(nodes)
      .where(and(eq(nodes.userId, userId), inArray(nodes.parentId, frontier)));

    frontier = children.map((c) => c.id);
    ids.push(...frontier);
  }

  return ids;
}

/**
 * Everything the completion path needs about a repeating task: its rule, the dates the
 * rule moves, and how the series ends.
 *
 * Returns null for everything else — a project, a goal, a task with recurrence off — which
 * is the overwhelmingly common case and the one that must stay on the plain path.
 */
async function recurrenceOf(tx: Executor, userId: string, nodeId: string) {
  const [row] = await tx
    .select({
      frequency: taskDetails.recurrenceFrequency,
      interval: taskDetails.recurrenceInterval,
      mode: taskDetails.recurrenceMode,
      pattern: taskDetails.recurrencePattern,
      byWeekday: taskDetails.recurrenceByWeekday,
      monthDay: taskDetails.recurrenceMonthDay,
      ordinal: taskDetails.recurrenceOrdinal,
      weekday: taskDetails.recurrenceWeekday,
      month: taskDetails.recurrenceMonth,
      end: taskDetails.recurrenceEnd,
      endCount: taskDetails.recurrenceCount,
      endUntil: taskDetails.recurrenceUntil,
      deadline: nodes.deadline,
      deferredDate: nodes.deferredDate,
      targetStartDate: nodes.targetStartDate,
      targetEndDate: nodes.targetEndDate,
      reminderAt: taskDetails.reminderAt,
    })
    .from(taskDetails)
    .innerJoin(nodes, eq(nodes.id, taskDetails.nodeId))
    .where(
      and(
        eq(nodes.id, nodeId),
        eq(nodes.userId, userId),
        eq(nodes.type, "task"),
        ne(taskDetails.recurrenceFrequency, "none"),
      ),
    )
    .limit(1);

  return row ?? null;
}

type Recurrence = NonNullable<Awaited<ReturnType<typeof recurrenceOf>>>;

/**
 * The date the pattern is *about*: the deadline if there is one, else a *still-holding*
 * deferred date, else the target start.
 *
 * A deadline is the date a repeating task is named for — "the report is due every Friday"
 * means Friday is the deadline, not the day you start. Only when there is no deadline does
 * the defer date take over as the thing the schedule moves.
 *
 * An **expired** deferred date is shelf residue (expiry is derived, never swept) and must
 * not be the shift origin. Using it turned "complete the routine that came back today"
 * into a multi-year jump of every other date — target start leapt to 2033 from a 2020
 * residue in one case. Fall through to target start, or to null so `nextAnchor` can stand
 * on the completion day.
 *
 * `asOfDay` is the completion's local `YYYY-MM-DD` — the same day key the shelf itself
 * compares against.
 */
function anchorOf(r: Recurrence, asOfDay: string): Date | null {
  if (r.deadline) return r.deadline;
  if (r.deferredDate && toDateKey(r.deferredDate) > asOfDay) return r.deferredDate;
  return r.targetStartDate;
}

/**
 * Where the whole date set moves to, or null when the series has run out.
 *
 * The two modes differ only in what they measure from, and that difference is the feature:
 * `scheduled` steps on from this occurrence's own anchor, so completing early buys time and
 * completing late still leaves you owing the one you missed; `regenerate` steps on from the
 * completion, so no amount of brushing your teeth today changes tomorrow.
 */
function nextAnchor(
  r: Recurrence,
  anchor: Date | null,
  completedAt: Date,
): Date | null {
  if (r.mode === "regenerate") return nextDue(completedAt, r.frequency, r.interval);

  return nextOccurrence(
    {
      frequency: r.frequency,
      interval: r.interval,
      pattern: r.pattern,
      byWeekday: r.byWeekday,
      monthDay: r.monthDay,
      ordinal: r.ordinal,
      weekday: r.weekday,
      month: r.month,
    },
    // With no dates at all there is nothing to step on from, so the completion stands in.
    // That is the "brush teeth" case: it acquires a defer date and nothing else.
    anchor ?? completedAt,
  );
}

/**
 * Where each of a repeating task's dates lands on the next occurrence.
 *
 * Everything already set shifts by the same number of days. What differs is which fields
 * are **created** when they were empty:
 *
 * - **Target start and deferred date are always set** to the next occurrence (when empty).
 *   Live Achieve (latest release) does the same on complete for both Repeat and Regenerate
 *   patterns: next instance gets Start Date and Deferred Date equal to the recurrence day,
 *   even with no deadline. That both *plans* the next run and *hides* it until then
 *   (tickler). We keep that date pair.
 * - **State becomes postponed** until the deferred date expires — our deliberate link
 *   between Postponed and Deferred Date (GTD tickler). Achieve left the new instance NS
 *   and used the deferred date alone for visibility; we park it as postponed so one shelf
 *   rule hides it everywhere without a separate "deferred filter".
 * - **A deadline is only ever advanced, never invented.** "Should be done ASAP" is not a
 *   deadline; inventing one would push routines into Overdue against real bills.
 * - **Target end and the reminder are only moved**, never invented.
 *
 * We also **cycle one row** and log completions rather than copying the outline tree —
 * otherwise daily routines fill the file with completed clones (the failure mode in large
 * Achieve data files).
 */
function moveDates(r: Recurrence, shift: number, next: Date, asOfDay: string) {
  // Calendar columns must leave as UTC noon, not process-local midnight after addDays.
  const move = (date: Date | null) =>
    date ? asCalendarDay(addDays(date, shift)) : null;
  const nextDay = asCalendarDay(next);

  // Shift what was set; create target start / deferred when empty. A shifted deferred that
  // still does not hold (stale residue, shift 0 from a regenerating complete) cannot hide
  // the task — land the shelf on `next` so the new cycle actually defers.
  let deferredDate = move(r.deferredDate) ?? nextDay;
  if (toDateKey(deferredDate) <= asOfDay) deferredDate = nextDay;

  const targetStartDate = move(r.targetStartDate) ?? nextDay;

  return {
    // All four live on `nodes` now, so they land in one write.
    node: {
      deadline: move(r.deadline),
      // A task deferred past its own deadline is odd but legal, and on a deadline-anchored
      // series it is the one shape that could push a *created* start date behind the defer
      // date and trip `nodes_start_not_before_deferred` — on an unattended completion, at
      // that. Availability wins: you cannot begin before the task comes back.
      targetStartDate: targetStartDate < deferredDate ? deferredDate : targetStartDate,
      deferredDate,
      targetEndDate: move(r.targetEndDate),
    },
    task: {
      // Reminder is an instant-ish nudge; still normalize so a bare date does not drift.
      reminderAt: move(r.reminderAt),
    },
  };
}

/**
 * Whether this completion is the series' last, so the task finishes for real instead of
 * cycling. `completionsSoFar` excludes the completion being recorded right now.
 */
function seriesEnds(
  r: Recurrence,
  next: Date | null,
  completionsSoFar: number,
): boolean {
  if (!next) return true;
  // A missing count is "ends after N times" with no N, which is not an instruction to
  // stop — reading it as 1 would silently finish the task on its very first completion.
  if (r.end === "count" && r.endCount != null) {
    return completionsSoFar + 1 >= r.endCount;
  }
  // Inclusive of the until date's own day, matching how appointment recurrence reads it.
  if (r.end === "until" && r.endUntil) {
    return toDateKey(next) > toDateKey(r.endUntil);
  }
  return false;
}

/**
 * Move a node to `state`, handling the one case that is not a plain column write:
 * **completing a recurring task**, which cycles the task instead of finishing it.
 *
 * This exists as a shared helper because node state has two independent writers — the
 * grids and the outline go through `setState`, while the detail drawer's State dropdown
 * goes through `saveNodeDetail` — and both already had their own copy of the "stamp
 * `completedAt`" rule. Recurrence has to fire from both, so it lives here and is called
 * from each rather than being written twice and drifting.
 *
 * Completing a recurring task, in one transaction:
 *
 * 1. logs the completion to `task_completions` — the row is about to stop looking
 *    completed, and this is the only record that it ever was;
 * 2. moves the whole date set on, so the task drops out of the Task Chooser until it is
 *    due again, and stamps `dateCompleted` as "last completed";
 * 3. resets the task and **every** descendant to Not Started, clearing their progress;
 * 4. checks off the task's line on the Day page and opens one on its next due day.
 *
 * Step 4 runs for ordinary tasks too, minus the second half. Completing a task means the
 * same thing wherever you do it, so the day line follows from any surface — the day page
 * itself just gets there first.
 *
 * Step 3 is Achieve §3.9: the new instance is a copy whose child items are all initialized
 * back to Not Started. Subtasks under a repeating task are a checklist of steps toward it —
 * get the keys, unlock the shed, fill the mower — and none of them carry over to next
 * week's mow. Cancelled steps come back too: cancelling one means "not needed this time",
 * and a step that never belongs on the list is deleted rather than cancelled. So does an
 * in-progress one, because part-done work on one instance is not part-done work on the
 * next; if progress did carry over, the task would not be recurring at all.
 *
 * Takes an executor so callers can compose it into their own transaction.
 *
 * `at` is **when this happened**, defaulting to now. It is not decoration: a task ticked off
 * weeks after it was really done should record the completion on the day it happened, and a
 * repeating one should step to its next occurrence from *that* date rather than from today.
 * Typing the real date into Date completed is how you say so — see `stateFromDates`.
 */
export async function applyStateTransition(
  tx: Executor,
  userId: string,
  nodeId: string,
  state: NodeState,
  at: Date = new Date(),
): Promise<void> {
  const [node] = await tx
    .select({ type: nodes.type })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .limit(1);
  // Mutations in this module historically no-op for a missing/foreign id. Preserve that
  // user-isolation contract while still rejecting an owned Result Area explicitly.
  if (!node) return;
  assertSupportsLifecycleState(node.type);
  const now = at;

  // Cancelled is a settled decision not to do the work — the day keeps a crossed-off line
  // with an X, the same way completed keeps a check. It is not the same as deleting the
  // task, and it is not a soft reopen of an earlier completion either.
  if (state === "cancelled") {
    await tx
      .update(nodes)
      .set({ state: "cancelled", completedAt: null, updatedAt: now })
      .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
    await syncDayLineOnCancel(tx, userId, nodeId, now);
    await applySettlePriorityClear(tx, userId, nodeId, state, false);
    return;
  }

  if (state !== "completed") {
    await tx
      .update(nodes)
      .set({ state, completedAt: null, updatedAt: now })
      .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
    await reopenDayLine(tx, userId, nodeId, now);
    // Shelving clears descendant plans that fall inside the shelf and drops their day lines.
    // Re-syncing this node itself covers the indefinite case (no open line whatever its plan).
    if (state === "postponed") {
      await clearConflictingDescendantPlans(tx, userId, nodeId);
      await syncDayLineToTargetStart(tx, userId, nodeId);
    }
    return;
  }

  const recurrence = await recurrenceOf(tx, userId, nodeId);

  // Date completed is a calendar day, not an instant. `at` is the wall-clock moment of
  // completion (or a UTC-noon day from the Date completed field): take its **local** day
  // key, then encode as UTC noon. Using `toDateKey`/`asCalendarDay` on a live instant is
  // wrong after ~20:00 in the Americas — UTC has already rolled to tomorrow.
  // See agent-os/standards/development/dates.md.
  const completedDayKey = localDateKey(now);
  const completedDay = fromDateKey(completedDayKey);

  async function finish() {
    await tx
      .update(nodes)
      .set({ state, completedAt: now, updatedAt: now })
      .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
    await tx
      .update(taskDetails)
      .set({ dateCompleted: completedDay })
      .where(eq(taskDetails.nodeId, nodeId));
  }

  if (!recurrence) {
    await finish();
    await syncDayLineOnCompletion(tx, userId, nodeId, now);
    await applySettlePriorityClear(tx, userId, nodeId, state, false);
    return;
  }

  const anchor = anchorOf(recurrence, completedDayKey);
  const next = nextAnchor(recurrence, anchor, now);

  // Counted before the insert below, or "end after N occurrences" is off by one.
  const [{ value: completionsSoFar }] = await tx
    .select({ value: count() })
    .from(taskCompletions)
    .where(and(eq(taskCompletions.userId, userId), eq(taskCompletions.nodeId, nodeId)));

  await tx.insert(taskCompletions).values({ userId, nodeId, completedAt: now });

  // The one path on which a repeating task stays completed: its series is over. Its dates
  // are left where they are, so the record reads as the last occurrence rather than as one
  // that never happened.
  if (seriesEnds(recurrence, next, completionsSoFar)) {
    await finish();
    // The series is over, so nothing follows it onto a future day — but the day line still
    // gets checked off, exactly as it would for any other task being finished.
    await syncDayLineOnCompletion(tx, userId, nodeId, now);
    await applySettlePriorityClear(tx, userId, nodeId, state, false);
    return;
  }

  // The whole subtree, whatever state each step was left in — see the note above the
  // function. A checklist under a repeating task describes how to do it, not how far
  // through one instance of it you got.
  const resetIds = await subtreeIds(tx, userId, nodeId);

  await tx
    .update(nodes)
    .set({ state: "not_started", completedAt: null, updatedAt: now })
    .where(and(eq(nodes.userId, userId), inArray(nodes.id, resetIds)));

  await tx
    .update(taskDetails)
    .set({
      percentComplete: 0,
      actualEffortMinutes: 0,
      actualStartDate: null,
      dateCompleted: null,
      // Work left starts over at the full estimate. Null estimate stays null.
      effortLeftMinutes: sql`${taskDetails.effortMinutes}`,
    })
    .where(inArray(taskDetails.nodeId, resetIds));

  // Last, so it survives the blanket reset above: on the recurring task itself,
  // `dateCompleted` means "last completed", and the whole date set moves together.
  //
  // Every date the task already had shifts by the same number of days, so a task that
  // starts Monday and is due Friday keeps its four-day window instead of collapsing onto
  // one day. Whole days applied with `addDays`, never a millisecond offset: an ordinal or
  // weekday step is not a constant length, and a span crossing a daylight-saving boundary
  // would otherwise drag every other date's time of day with it.
  //
  // Which fields get *created* when they were empty is the part that matters. See
  // `moveDates` below.
  const shift = anchor ? daysBetween(anchor, next!) : 0;
  const dates = moveDates(recurrence, shift, next!, completedDayKey);

  await tx
    .update(nodes)
    .set({
      ...dates.node,
      // Shelved until its next occurrence — the deferred date this write lands is the expiry
      // of exactly that. The blanket reset above put the whole subtree back to Not Started,
      // which is right for the checklist beneath it but not for the task itself: it is not
      // waiting to be started, it is done until next time, and the State column should say
      // so rather than leaving the Chooser to explain its absence. If the new date is
      // somehow already past, the shelf simply reads as expired.
      state: "postponed",
      updatedAt: now,
    })
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));

  // A dated shelf on the routine itself rarely conflicts with its children's plans (they
  // were just reset), but the rule is the same as any other shelve.
  await clearConflictingDescendantPlans(tx, userId, nodeId);

  await tx
    .update(taskDetails)
    .set({ dateCompleted: completedDay, ...dates.task })
    .where(eq(taskDetails.nodeId, nodeId));

  await syncDayLineOnCompletion(tx, userId, nodeId, now);
  await syncDayLineToTargetStart(tx, userId, nodeId);
  await applySettlePriorityClear(tx, userId, nodeId, state, true);
}

/**
 * Record a completed task as crossed off on the day it was completed.
 *
 * The day page is a paper day: you can turn back to Tuesday and see what you wrote and what
 * you crossed off. So **every** completed task gets a struck-through line on the day it was
 * completed — whether or not it was planned there, whether or not it repeats, and whichever
 * surface you were looking at when you ticked it. A record with holes in it is not a record.
 *
 * Only the record. Where a repeating task's *next* occurrence lands is not decided here:
 * completing one writes a fresh `target_start_date`, and `syncDayLineToTargetStart` puts
 * the open line on that day. One mechanism deciding which day a task sits on, not two
 * aiming at the same square.
 */
async function syncDayLineOnCompletion(
  tx: Executor,
  userId: string,
  nodeId: string,
  completedAt: Date,
): Promise<void> {
  await settleDayLine(tx, userId, nodeId, completedAt, "completed");
}

/**
 * Same paper-day record as completion, for a cancelled task. The line stays on the day with
 * `completedAt` set so it sorts and filters with settled work; the state itself is
 * `cancelled` so the check box can show an X rather than a tick.
 */
async function syncDayLineOnCancel(
  tx: Executor,
  userId: string,
  nodeId: string,
  at: Date,
): Promise<void> {
  await settleDayLine(tx, userId, nodeId, at, "cancelled");
}

/** Cross off the open day line (or write one for today) as completed or cancelled. */
async function settleDayLine(
  tx: Executor,
  userId: string,
  nodeId: string,
  at: Date,
  state: "completed" | "cancelled",
): Promise<void> {
  const rows = await tx
    .select({
      id: dailyItems.id,
      day: dailyItems.day,
      completedAt: dailyItems.completedAt,
      forwardedTo: dailyItems.forwardedTo,
      priorityLetter: dailyItems.priorityLetter,
    })
    .from(dailyItems)
    .where(and(eq(dailyItems.userId, userId), eq(dailyItems.nodeId, nodeId)));

  // Wall-clock day of the instant — not `toDateKey` (UTC components of an instant).
  const today = localDateKey(at);
  const open = rows.find((r) => r.completedAt === null && r.forwardedTo === null);
  // Judged by when it was settled rather than which day it sits on, so acting on Monday's
  // forgotten line today still counts as today's record.
  const settledToday = rows.find(
    (r) => r.completedAt && localDateKey(r.completedAt) === today,
  );

  if (open) {
    await tx
      .update(dailyItems)
      .set({ state, completedAt: at, updatedAt: at })
      .where(and(eq(dailyItems.id, open.id), eq(dailyItems.userId, userId)));
  } else if (!settledToday) {
    await addDayLine(tx, userId, nodeId, today, {
      state,
      completedAt: at,
    });
  }
}

/** Append a line for a task to the end of a day. Silent if one is already there. */
async function addDayLine(
  tx: Executor,
  userId: string,
  nodeId: string,
  day: string,
  values: {
    state?: NodeState;
    completedAt?: Date;
    priorityLetter?: PriorityLetter | null;
  },
): Promise<void> {
  const [last] = await tx
    .select({ sortKey: dailyItems.sortKey })
    .from(dailyItems)
    .where(and(eq(dailyItems.userId, userId), eq(dailyItems.day, day)))
    .orderBy(sql`${dailyItems.sortKey} desc`)
    .limit(1);

  await tx
    .insert(dailyItems)
    .values({
      userId,
      nodeId,
      day,
      sortKey: between(last?.sortKey ?? null, null),
      ...values,
    })
    .onConflictDoNothing();
}

/**
 * Un-check the day line when a task is moved back out of `completed`.
 *
 * Same principle in reverse: reopening a task in the outline should not leave the day page
 * insisting it was finished. Deliberately narrow, though — only a line completed **today**,
 * and only when the task has no open line elsewhere.
 *
 * Both guards earn their place. The day page is a record of what happened on a day, not a
 * live view of the task (the same reason `forwardedTo` marks a line rather than moving it),
 * so correcting a mis-click is fair game and rewriting last Tuesday is not. And a repeating
 * task that has already cycled *has* an open line — on its next due day — so this leaves
 * its completed one alone, which is right: that occurrence really was done.
 */
async function reopenDayLine(
  tx: Executor,
  userId: string,
  nodeId: string,
  now: Date,
): Promise<void> {
  const rows = await tx
    .select({
      id: dailyItems.id,
      completedAt: dailyItems.completedAt,
      forwardedTo: dailyItems.forwardedTo,
    })
    .from(dailyItems)
    .where(and(eq(dailyItems.userId, userId), eq(dailyItems.nodeId, nodeId)));

  if (rows.some((r) => r.completedAt === null && r.forwardedTo === null)) return;

  // Wall-clock day of the reopen instant (same rule as settleDayLine).
  const today = localDateKey(now);
  const doneToday = rows.find(
    (r) => r.completedAt && localDateKey(r.completedAt) === today,
  );
  if (!doneToday) return;

  await tx
    .update(dailyItems)
    .set({ state: "not_started", completedAt: null, updatedAt: now })
    .where(and(eq(dailyItems.id, doneToday.id), eq(dailyItems.userId, userId)));

  // The line is open again on today, so the task's target start date has to say today —
  // that column is what decides which day a task sits on, and reopening something you
  // finished this morning is a statement that you are still doing it today.
  //
  // Which also un-shelves it. A routine ticked this morning was deferred to its next
  // occurrence on the way out; saying you are still doing it today contradicts that, and
  // leaving the shelf in place would both hide it from the Chooser and put a plan before
  // its availability, which the constraint rejects. Only a *future* shelf is cleared — a
  // date already past is inert and is left as the record of the last cycle.
  const startOfToday = fromDateKey(today);
  const [node] = await tx
    .select({ deferredDate: nodes.deferredDate })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .limit(1);

  await tx
    .update(nodes)
    .set({
      targetStartDate: startOfToday,
      ...(node?.deferredDate && node.deferredDate > startOfToday
        ? { deferredDate: null }
        : {}),
      updatedAt: now,
    })
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
}

/**
 * Set one node's state, and bring the rest of its branch into line — see
 * `completionCascade.ts` for the rule and why it is asymmetric.
 *
 * Every affected node goes through `applyStateTransition`, so a cascaded completion means
 * exactly what a hand-typed one does: the same day-line sync, and the same treatment of a
 * repeating task, which steps to its next occurrence rather than closing.
 *
 * One transaction, so a branch is never left half-settled.
 */
export async function setState(
  userId: string,
  nodeId: string,
  state: NodeState,
): Promise<void> {
  await db.transaction(async (tx) => {
    await applyStateTransition(tx, userId, nodeId, state);

    // Cascade from the state the node **actually ended up in**, not the one that was asked
    // for. Completing a repeating task does not settle it — it steps to the next occurrence
    // and resets its subtree (see `applyStateTransition`) — so reading the request would
    // settle the very children that were just cleared for the next round. Reading the result
    // instead gets that case right without special-casing recurrence here.
    const branch = await branchStates(tx, userId, nodeId);
    const settled = branch.find((node) => node.id === nodeId)?.state ?? state;

    // Pass the request as well as the result: a repeating task never lands on `completed`
    // (it shelves until next time) but work did happen, so not-started ancestors still start.
    for (const change of cascadeStateChange(branch, nodeId, settled, state)) {
      await applyStateTransition(tx, userId, change.id, change.state);
    }
  });
}

/**
 * Apply the upward half of the cascade — start not-started ancestors, reopen settled ones —
 * for callers that drive one node's state themselves instead of going through `setState`.
 *
 * The detail drawer and the day page both call `applyStateTransition` directly, because both
 * have their own work to do around it (a whole draft of side-table fields; a day row whose
 * own state is finer than the task's). Neither used to touch the branch, so completing a
 * subtask from its drawer, or ticking it on the day page, left a Not started project sitting
 * above finished work — and re-opening one left a completed project above open work.
 *
 * **Upward only, and deliberately.** The downward half settles open work, which is the
 * direction you cannot undo by reversing the gesture, and the grids gate it behind a
 * confirmation naming the count (`useStateChange.ts`). Neither of these surfaces has that
 * confirmation yet, so neither gets the settling half.
 *
 * `requested` is what the caller asked for. Completing a repeating task never lands on
 * `completed`, and without the request the parents would stay Not started after real work.
 *
 * Call it inside the caller's transaction, after the transition, so the branch is never left
 * half-changed by a failure between two statements.
 */
export async function reopenSettledAncestors(
  tx: Executor,
  userId: string,
  nodeId: string,
  requested?: NodeState,
): Promise<void> {
  const chain = await selfAndAncestors(tx, userId, nodeId);
  const self = chain.find((node) => node.id === nodeId);
  if (!self || self.state === null) return;

  for (const change of cascadeStateChange(
    chain,
    nodeId,
    self.state,
    requested ?? self.state,
  )) {
    await applyStateTransition(tx, userId, change.id, change.state);
  }
}

const CASCADE_SELECT = { id: nodes.id, parentId: nodes.parentId, state: nodes.state };

/**
 * The node's subtree and its ancestor chain, which between them are every node the cascade
 * can reach. Loading the whole outline would work and would also mean reading a few thousand
 * rows to settle one task.
 */
async function branchStates(
  tx: Executor,
  userId: string,
  nodeId: string,
): Promise<CascadeNode[]> {
  const descendants = await tx
    .select(CASCADE_SELECT)
    .from(nodes)
    .where(
      and(
        eq(nodes.userId, userId),
        inArray(nodes.id, await subtreeIds(tx, userId, nodeId)),
      ),
    );

  const out = [...descendants];
  const seen = new Set(out.map((node) => node.id));

  for (const node of await selfAndAncestors(tx, userId, nodeId)) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    out.push(node);
  }

  return out;
}

/**
 * The node and every ancestor above it, nearest first. One query per level rather than a
 * recursive CTE: outlines are shallow, and this reads the same way the pure cascade does.
 */
async function selfAndAncestors(
  tx: Executor,
  userId: string,
  nodeId: string,
): Promise<CascadeNode[]> {
  const out: CascadeNode[] = [];
  const seen = new Set<string>();

  let currentId: string | null = nodeId;
  while (currentId !== null && !seen.has(currentId)) {
    seen.add(currentId);
    const [row] = await tx
      .select(CASCADE_SELECT)
      .from(nodes)
      .where(and(eq(nodes.userId, userId), eq(nodes.id, currentId)));
    if (!row) break;
    out.push(row);
    currentId = row.parentId;
  }

  return out;
}

/**
 * Achieve's **Skip Recurrence** (§3.9.4): move a repeating task on to its next occurrence
 * without doing this one.
 *
 * The point is that skipping is not completing. Nothing is written to `task_completions`,
 * so the history stays honest and an "end after N occurrences" series is not spent; the
 * subtree is left exactly as it is, since none of it happened; and `dateCompleted` is not
 * touched, so "last completed" still means the last time it was actually done. All that
 * moves is the dates — which is the whole of it, and is why this shares `nextAnchor` with
 * the completion path rather than reimplementing the rule.
 *
 * A series that has run out cannot be skipped: there is nowhere to skip to.
 */
export async function skipRecurrence(userId: string, nodeId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const recurrence = await recurrenceOf(tx, userId, nodeId);
    if (!recurrence) throw new Error("That task does not repeat.");

    const now = new Date();
    const anchor = anchorOf(recurrence, localDateKey(now));
    const next = nextAnchor(recurrence, anchor, now);

    // Skipping cannot exhaust an "end after N" series, because it never counted toward
    // one. Only an unsatisfiable pattern, or an `until` date the next occurrence is past,
    // leaves nowhere to go.
    const pastEnd =
      recurrence.end === "until" &&
      recurrence.endUntil != null &&
      next != null &&
      toDateKey(next) > toDateKey(recurrence.endUntil);

    if (!next || pastEnd) {
      throw new Error("This series has no occurrences left to skip to.");
    }

    // The same date rule as a completion, from the same function — skipping is a
    // completion with the "you did it" half removed, and the two must not drift.
    const asOfDay = localDateKey(now);
    const dates = moveDates(
      recurrence,
      anchor ? daysBetween(anchor, next) : 0,
      next,
      asOfDay,
    );

    await tx
      .update(nodes)
      .set({ ...dates.node, state: "postponed", updatedAt: now })
      .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));

    await clearConflictingDescendantPlans(tx, userId, nodeId);

    await tx.update(taskDetails).set(dates.task).where(eq(taskDetails.nodeId, nodeId));

    // Skipping moves the target start, so the open day line follows it — the same rule a
    // completion goes through. Without this the line stays on the day you skipped.
    await syncDayLineToTargetStart(tx, userId, nodeId);
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
  // Same trim rule as the detail form: blank means uncategorised, no leading/trailing
  // space that would fork an otherwise identical group label.
  const normalized =
    category === null || category.trim() === "" ? null : category.trim();
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
  tx: Executor,
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
      .where(and(eq(nodes.id, assignment.nodeId), eq(nodes.userId, userId)));
  }
}
