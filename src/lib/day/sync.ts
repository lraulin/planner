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
 * > A task with a target start date has exactly one open day line, on that date.
 * > A task without one has none.
 *
 * Completed and forwarded rows are untouched — they are history, and history does not move
 * when you change your plans.
 *
 * **Tasks only.** Projects can be planned for a day too, but `target_start_date` lives on
 * `task_details` and projects have no equivalent, so a planned project keeps its row as its
 * only home. Widening this would mean moving the column up to `nodes`.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { dailyItems, nodes, taskDetails } from "@/db/schema";
import { toDateKey } from "@/lib/schedule/geometry";
import { between } from "@/lib/tree/sortKey";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

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
): Promise<void> {
  const [task] = await tx
    .select({
      targetStartDate: taskDetails.targetStartDate,
      name: nodes.name,
      state: nodes.state,
    })
    .from(taskDetails)
    .innerJoin(nodes, eq(nodes.id, taskDetails.nodeId))
    .where(
      and(
        eq(taskDetails.nodeId, nodeId),
        eq(nodes.userId, userId),
        eq(nodes.type, "task"),
      ),
    )
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
  const wanted =
    task.state === "completed" || task.state === "cancelled"
      ? null
      : task.targetStartDate && toDateKey(task.targetStartDate);

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

/** Write a task's target start date, then put its day line where that says. */
export async function setTargetStartDay(
  tx: Executor,
  userId: string,
  nodeId: string,
  day: string | null,
): Promise<void> {
  await tx
    .update(taskDetails)
    .set({ targetStartDate: day ? new Date(`${day}T00:00:00`) : null })
    .where(eq(taskDetails.nodeId, nodeId));

  await syncDayLineToTargetStart(tx, userId, nodeId);
}
