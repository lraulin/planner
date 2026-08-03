/**
 * Keeps a task's open day line on its **target start date**.
 *
 * Achieve's target start date is "when you intend to begin working on this item", which is
 * the same statement the day page's "Plan for day" makes. Two fields meaning one thing is
 * how views end up fighting, so there is one source of truth — `target_start_date` — and
 * the day row follows it.
 *
 * `daily_items` still exists, and still has to, because a column cannot hold what a paper
 * day holds: a **forwarded** mark saying what became of Wednesday, a line **crossed off** on
 * the day you did it (which survives the task itself recurring and moving on), a per-day
 * ABC rank, and lines jotted straight onto a day with no task behind them at all. What the
 * column decides is only *which day an unfinished task sits on*.
 *
 * The invariant, maintained here and nowhere else:
 *
 * > A task with a target start date has exactly one open day line on that date when the
 * > start is today or future — unless that day still falls inside an active shelf (own or
 * > inherited), in which case it has none.
 * > When target start is **in the past** and the task is still open, the open line sits on
 * > **today** so Behind Schedule work stays on the day page without rewriting the plan
 * > date (manual §3.8: NS + past target start = Behind Schedule).
 * > A task without a target start has none.
 *
 * The shelf rule is deliberately **narrow**: suppress only while the planned day is still
 * inside the shelf, not whenever the node is postponed. Suppressing on postponement alone
 * would break "come back on Feb 15, plan for Mar 15" — expiry is derived rather than swept,
 * so nothing would write on Feb 16 to create the line. An indefinite shelf swallows every
 * day (its only exit is a state change, always a write).
 *
 * Completed and forwarded rows are untouched — they are history, and history does not move
 * when you change your plans.
 *
 * **Tasks only**, and that is the whole rule for the day list — a day page holds work you
 * can finish in a day, which is what distinguishes a task from a project. A project that
 * wants to be on a day should have a task under it that says what you are actually doing.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { dailyItems, nodes } from "@/db/schema";
import { localDateKey, fromDateKey, toDateKey } from "@/lib/schedule/geometry";
import { laterShelf, ownShelf, shelfHolds, type Shelf } from "@/lib/tree/shelving";
import { between } from "@/lib/tree/sortKey";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

/**
 * The effective shelf on a node: its own, combined with every ancestor's, latest wins.
 * Mirror of the memoized walk in `derive.ts`, for the single-node path mutations take.
 */
export async function effectiveShelfOf(
  tx: Executor,
  userId: string,
  nodeId: string,
): Promise<Shelf | null> {
  let shelf: Shelf | null = null;
  let currentId: string | null = nodeId;

  while (currentId) {
    const [row] = await tx
      .select({
        id: nodes.id,
        parentId: nodes.parentId,
        state: nodes.state,
        deferredDate: nodes.deferredDate,
      })
      .from(nodes)
      .where(and(eq(nodes.id, currentId), eq(nodes.userId, userId)))
      .limit(1);

    if (!row) break;
    shelf = laterShelf(shelf, ownShelf(row));
    currentId = row.parentId;
  }

  return shelf;
}

/** A sort key placing a new row at the end of `day`. */
async function endOfDay(tx: Executor, userId: string, day: string): Promise<string> {
  const [last] = await tx
    .select({ sortKey: dailyItems.sortKey })
    .from(dailyItems)
    .where(and(eq(dailyItems.userId, userId), eq(dailyItems.day, day)))
    .orderBy(sql`${dailyItems.sortKey} desc`)
    .limit(1);

  return between(last?.sortKey ?? null, null);
}

/**
 * Put the task's open day line where its target start date says it belongs — moving it,
 * creating it, or removing it as required.
 *
 * Call this after anything writes `target_start_date`: the detail form, recurrence, a skip.
 * It is idempotent, so calling it when nothing changed costs one query and does nothing.
 */
export async function syncDayLineToTargetStart(
  tx: Executor,
  userId: string,
  nodeId: string,
  /**
   * Calendar day for "past start stays on the day page". Defaults to the server's local
   * today — same as carry-forward.
   */
  today: string = localDateKey(new Date()),
): Promise<void> {
  const [task] = await tx
    .select({
      targetStartDate: nodes.targetStartDate,
      name: nodes.name,
      state: nodes.state,
    })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId), eq(nodes.type, "task")))
    .limit(1);

  // Not a task, so it has no target start date to follow.
  if (!task) return;

  const [open] = await tx
    .select({ id: dailyItems.id, day: dailyItems.day })
    .from(dailyItems)
    .where(
      and(
        eq(dailyItems.userId, userId),
        eq(dailyItems.nodeId, nodeId),
        isNull(dailyItems.completedAt),
        isNull(dailyItems.forwardedTo),
      ),
    )
    .limit(1);

  // A finished task does not belong on a list of things to do, whatever date it carries.
  let wanted: string | null =
    task.state === "completed" || task.state === "cancelled"
      ? null
      : task.targetStartDate
        ? toDateKey(task.targetStartDate)
        : null;

  // Past plan date: keep the work on today's page without rewriting target start (Behind
  // Schedule). Future plans stay on their day; today is unchanged.
  if (
    wanted &&
    wanted < today &&
    task.state !== "completed" &&
    task.state !== "cancelled"
  ) {
    wanted = today;
  }

  // No open line while the day it would sit on is still inside a shelf (own or inherited).
  // `shelfHolds` with the planned day as "today" is exactly that comparison.
  if (wanted) {
    const shelf = await effectiveShelfOf(tx, userId, nodeId);
    if (shelfHolds(shelf, wanted)) wanted = null;
  }

  if (!wanted) {
    if (open) {
      await tx.delete(dailyItems).where(eq(dailyItems.id, open.id));
    }
    return;
  }

  if (open?.day === wanted) return;

  if (open) {
    // Moving days clears the ABC rank, as a manual move does: ranks are dense within a day,
    // and "essential today" is a judgement about *that* day, to be made again on arrival.
    await tx
      .update(dailyItems)
      .set({
        day: wanted,
        priorityLetter: null,
        priorityRank: null,
        sortKey: await endOfDay(tx, userId, wanted),
        updatedAt: new Date(),
      })
      .where(eq(dailyItems.id, open.id));
    return;
  }

  await tx.insert(dailyItems).values({
    userId,
    nodeId,
    day: wanted,
    // Snapshot, so the day keeps an honest record if the task is later deleted. Display
    // still prefers the task's live name while it exists.
    title: task.name,
    sortKey: await endOfDay(tx, userId, wanted),
  });
}

/**
 * After a node is shelved: clear descendant plans that fall *inside* the shelf, and re-sync
 * their day lines so they disappear.
 *
 * Shelving clears conflicting plans; it does not push them. A task planned for Tuesday and
 * then shelved (via its parent) to November is not *planned for November*. Descendants
 * planned *after* a dated shelf are left alone — a shelf and a later plan are compatible.
 * An indefinite shelf has no "after", so every descendant plan goes.
 *
 * The node itself is not cleared: "come back on Feb 15; plan for Mar 15" is a coherent setup
 * on one row, and the CHECK already permits it.
 */
export async function clearConflictingDescendantPlans(
  tx: Executor,
  userId: string,
  nodeId: string,
): Promise<void> {
  const [shelfNode] = await tx
    .select({
      state: nodes.state,
      deferredDate: nodes.deferredDate,
    })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .limit(1);

  // Only a postponed row shelves anything. A deferred date on any other state is residue.
  if (!shelfNode || shelfNode.state !== "postponed") return;

  const untilKey = shelfNode.deferredDate ? toDateKey(shelfNode.deferredDate) : null;

  // Breadth-first descendants, excluding the shelved node itself.
  const toClear: string[] = [];
  let frontier = [nodeId];

  while (frontier.length > 0) {
    const children = await tx
      .select({
        id: nodes.id,
        targetStartDate: nodes.targetStartDate,
      })
      .from(nodes)
      .where(and(eq(nodes.userId, userId), inArray(nodes.parentId, frontier)));

    frontier = children.map((c) => c.id);
    for (const child of children) {
      if (!child.targetStartDate) continue;
      const startKey = toDateKey(child.targetStartDate);
      // Indefinite (untilKey null) clears every plan; a date clears only those before it.
      if (untilKey === null || startKey < untilKey) {
        toClear.push(child.id);
      }
    }
  }

  if (toClear.length === 0) return;

  await tx
    .update(nodes)
    .set({
      targetStartDate: null,
      targetEndDate: null,
      updatedAt: new Date(),
    })
    .where(and(eq(nodes.userId, userId), inArray(nodes.id, toClear)));

  for (const id of toClear) {
    await syncDayLineToTargetStart(tx, userId, id);
  }
}

/** Re-sync every task under (and including) `rootId` — used after re-parenting into a shelf. */
export async function syncDayLinesInSubtree(
  tx: Executor,
  userId: string,
  rootId: string,
): Promise<void> {
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

  for (const id of ids) {
    await syncDayLineToTargetStart(tx, userId, id);
  }
}

/**
 * Put a task on a day — the write behind every day-page gesture.
 *
 * Sets **both** ends of the range to that day, because that is what putting something on a
 * daily list means: I intend to start and finish this on this day. Work that genuinely
 * spans several days is a project, or at least a task with subtasks, and wants its dates
 * set on the record rather than by dropping it on a square.
 *
 * Editing Target start on the record deliberately does *not* come through here. Typing a
 * date into the form is a finer act than dropping a card on a day, and overwriting a target
 * end you had set on purpose would be presumptuous.
 */
export async function setDayPlan(
  tx: Executor,
  userId: string,
  nodeId: string,
  day: string | null,
): Promise<void> {
  const date = day ? fromDateKey(day) : null;

  if (day) {
    // `nodes_start_not_before_deferred` would reject this write, and a raw constraint error
    // is not something to show a person who just dragged a card. Refusing is the right
    // answer rather than clearing the shelf for them: dropping a task on a day says when you
    // mean to do it, not that you have changed your mind about hiding it until February.
    const [row] = await tx
      .select({ deferredDate: nodes.deferredDate, name: nodes.name })
      .from(nodes)
      .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
      .limit(1);

    if (row?.deferredDate && toDateKey(row.deferredDate) > day) {
      throw new Error(
        `"${row.name}" is deferred until ${toDateKey(row.deferredDate)}, so it cannot be planned for ${day}.`,
      );
    }
  }

  await tx
    .update(nodes)
    .set({ targetStartDate: date, targetEndDate: date, updatedAt: new Date() })
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));

  await syncDayLineToTargetStart(tx, userId, nodeId);
}
