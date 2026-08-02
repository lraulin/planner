import { and, asc, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  dailyItems,
  nodes,
  notes,
  type NodeState,
  type PriorityLetter,
} from "@/db/schema";
import { ensureInbox } from "@/lib/capture/mutations";
import { toDateKey } from "@/lib/schedule/geometry";
import { applyStateTransition, createNode } from "@/lib/tree/mutations";
import { between } from "@/lib/tree/sortKey";
import { itemsToForward } from "./forward";
import { setDayPlan } from "./sync";
import { JOURNAL_SUBJECT } from "./types";
import type { DayAssignment } from "./priority";

/**
 * Writes for the daily task list.
 *
 * Every mutation takes a `userId` and scopes on it, so a caller cannot reach another user's
 * rows even by guessing an id. Same contract as `src/lib/tree/mutations.ts`.
 */

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

async function requireItem(tx: Executor, userId: string, itemId: string) {
  const [item] = await tx
    .select()
    .from(dailyItems)
    .where(and(eq(dailyItems.id, itemId), eq(dailyItems.userId, userId)))
    .limit(1);

  if (!item) throw new Error("Daily item not found.");
  return item;
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

/** The open row for a task, if it is currently planned for some day. */
async function openRowForNode(tx: Executor, userId: string, nodeId: string) {
  const [row] = await tx
    .select()
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

  return row ?? null;
}

/**
 * Add a line to a day.
 *
 * With no `nodeId` this is the jotted case — the one the whole tab exists for. It writes a
 * single row and asks nothing else of you: no parent, no result area, no effort estimate.
 */
export async function createDailyItem(params: {
  userId: string;
  day: string;
  title: string;
  nodeId?: string | null;
  priorityLetter?: PriorityLetter | null;
  priorityRank?: number | null;
}): Promise<string> {
  const {
    userId,
    day,
    title,
    nodeId = null,
    priorityLetter = null,
    priorityRank = null,
  } = params;

  return db.transaction(async (tx) => {
    // A task already sitting on another day moves rather than being duplicated — the
    // partial unique index would reject the second row anyway, and moving is what the
    // user meant.
    if (nodeId) {
      const existing = await openRowForNode(tx, userId, nodeId);
      if (existing) {
        await moveItemToDay(tx, userId, existing.id, day);
        return existing.id;
      }
    }

    const [created] = await tx
      .insert(dailyItems)
      .values({
        userId,
        day,
        nodeId,
        title,
        priorityLetter,
        priorityRank,
        sortKey: await endOfDay(tx, userId, day),
      })
      .returning({ id: dailyItems.id });

    return created.id;
  });
}

/** Rename a jotted line. Node-backed rows take their display name from the task instead. */
export async function updateDailyItemTitle(
  userId: string,
  itemId: string,
  title: string,
): Promise<void> {
  await db
    .update(dailyItems)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(dailyItems.id, itemId), eq(dailyItems.userId, userId)));
}

/**
 * Set a row's state, which is also how it gets checked off.
 *
 * For a node-backed row this goes through `applyStateTransition`, so completing a task from
 * the day page fires recurrence, the effort reset and the `task_completions` log exactly as
 * completing it from the outline would.
 *
 * **Checking off a node-backed line is not written here.** `applyStateTransition` owns the
 * completion stamp for every surface — it has to, since a task can be completed from four
 * of them — and stamping it here as well would be the same write twice, with the result
 * quietly depending on which ran last. A jotted line has no task behind it, so it does
 * stamp itself; and so does any line being *re*-opened, because the row's own state
 * (in progress, delegated, waiting) is finer than the task's and is not derivable from it.
 *
 * `completedAt` living on the row is what makes the day's record durable: a recurring task
 * is shelved until next time by that same call (`postponed` + deferred date), and a
 * derived checkmark would silently un-check itself the moment you finished it.
 */
export async function setDailyItemState(
  userId: string,
  itemId: string,
  state: NodeState,
): Promise<void> {
  await db.transaction(async (tx) => {
    const item = await requireItem(tx, userId, itemId);
    const completing = state === "completed";

    // Re-opening a completed row puts it back into the "one open day per task" index. If
    // the task has since been planned somewhere else, say so plainly rather than letting a
    // raw constraint violation surface.
    if (!completing && item.completedAt !== null && item.nodeId) {
      const other = await openRowForNode(tx, userId, item.nodeId);
      if (other && other.id !== itemId) {
        throw new Error(`That task is already planned for ${other.day}.`);
      }
    }

    if (!item.nodeId || !completing) {
      await tx
        .update(dailyItems)
        .set({
          state,
          completedAt: completing ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(and(eq(dailyItems.id, itemId), eq(dailyItems.userId, userId)));
    }

    if (item.nodeId) {
      await applyStateTransition(tx, userId, item.nodeId, state);
    }
  });
}

/** Persist a batch of ABC assignments from a drag or a typed cell. */
export async function setDailyPriorities(
  userId: string,
  assignments: DayAssignment[],
): Promise<void> {
  if (assignments.length === 0) return;

  await db.transaction(async (tx) => {
    for (const { id, letter, rank } of assignments) {
      await tx
        .update(dailyItems)
        .set({ priorityLetter: letter, priorityRank: rank, updatedAt: new Date() })
        .where(and(eq(dailyItems.id, id), eq(dailyItems.userId, userId)));
    }
  });
}

/**
 * Move a row to another day.
 *
 * The ABC priority is cleared on the way. Ranks are dense within a day, so carrying an "A1"
 * across would both leave a hole behind and collide with the destination's own A1 — and
 * more to the point, "essential today" is a judgement about *that* day, to be made again
 * when you get there.
 */
async function moveItemToDay(
  tx: Executor,
  userId: string,
  itemId: string,
  day: string,
): Promise<void> {
  const item = await requireItem(tx, userId, itemId);
  if (item.day === day) return;

  await tx
    .update(dailyItems)
    .set({
      day,
      priorityLetter: null,
      priorityRank: null,
      sortKey: await endOfDay(tx, userId, day),
      updatedAt: new Date(),
    })
    .where(and(eq(dailyItems.id, itemId), eq(dailyItems.userId, userId)));

  // Dragging an unfinished task to another day is re-planning it, so both ends of its
  // target range move with it — otherwise the drawer would go on claiming the old day. A
  // completed or forwarded row is history and does not re-plan anything.
  if (item.nodeId && item.completedAt === null && item.forwardedTo === null) {
    const date = new Date(`${day}T00:00:00`);
    await tx
      .update(nodes)
      .set({ targetStartDate: date, targetEndDate: date, updatedAt: new Date() })
      .where(and(eq(nodes.id, item.nodeId), eq(nodes.userId, userId)));
  }
}

export async function moveDailyItemToDay(
  userId: string,
  itemId: string,
  day: string,
): Promise<void> {
  await db.transaction((tx) => moveItemToDay(tx, userId, itemId, day));
}

/** Take a line off a day. Deletes only the row — a linked task is untouched. */
export async function deleteDailyItem(userId: string, itemId: string): Promise<void> {
  await db
    .delete(dailyItems)
    .where(and(eq(dailyItems.id, itemId), eq(dailyItems.userId, userId)));
}

/**
 * Plan a task for a day, or clear it — what the week view's drop targets and the day page
 * both call.
 *
 * Writes `target_start_date` and `target_end_date`, both to that day: Achieve's target start
 * date is "when you intend to begin working on this item", which is the same statement the
 * day list makes, and a day list holds work you mean to finish that day. The row follows
 * from `syncDayLineToTargetStart`; see `./sync` for why the row still exists at all.
 *
 * **Tasks only.** A project is by definition work that does not fit in a day; if one belongs
 * on a day page, what belongs there is a task under it saying what you are actually doing.
 *
 * Passing `null` un-plans it. It never completes or deletes anything: unplanning is "not
 * this day", not "not at all".
 */
export async function planNodeForDay(
  userId: string,
  nodeId: string,
  day: string | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [node] = await tx
      .select({ type: nodes.type })
      .from(nodes)
      .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
      .limit(1);

    if (!node) throw new Error("Task not found.");
    if (node.type !== "task") {
      throw new Error("Only tasks go on a day list. Add a task under it instead.");
    }

    await setDayPlan(tx, userId, nodeId, day);
  });
}

/**
 * Turn a jotted line into a real task in the Inbox, keeping it on the day.
 *
 * The escape hatch for the jot that turns out to be real work. Nothing is trapped on a day
 * page: it can be promoted and then filed, prioritised and scheduled like anything else.
 */
export async function promoteToTask(userId: string, itemId: string): Promise<string> {
  const item = await requireItem(db, userId, itemId);
  if (item.nodeId) return item.nodeId;

  const inboxId = await ensureInbox(userId);
  const nodeId = await createNode({
    userId,
    parentId: inboxId,
    type: "task",
    name: item.title,
  });

  await db
    .update(dailyItems)
    .set({ nodeId, updatedAt: new Date() })
    .where(and(eq(dailyItems.id, itemId), eq(dailyItems.userId, userId)));

  // The line now stands for a task, and a task says which day it is on with its target
  // dates. Without this the new task would have a day line and no dates to explain it. Both
  // ends, because a line on a day page is work you mean to start and finish that day.
  const date = new Date(`${item.day}T00:00:00`);
  await db
    .update(nodes)
    .set({ targetStartDate: date, targetEndDate: date, updatedAt: new Date() })
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));

  return nodeId;
}

/**
 * Carry unfinished rows from earlier days onto `today`.
 *
 * Runs on read from `loadDay` when you open today, so carry-over does not depend on the app
 * being open at midnight. Idempotent: a forwarded row carries a `forwardedTo` mark and is
 * skipped from then on, so loading the page twice cannot duplicate anything.
 *
 * Order inside the transaction matters. `daily_items_open_node_uq` only admits rows that are
 * open and unforwarded, so the old row must be *marked forwarded first* — otherwise the new
 * row on today collides with the very row it is replacing.
 */
export async function forwardOpenItems(
  userId: string,
  today: string = toDateKey(new Date()),
): Promise<number> {
  const candidates = await db
    .select({
      id: dailyItems.id,
      day: dailyItems.day,
      state: dailyItems.state,
      completedAt: dailyItems.completedAt,
      forwardedTo: dailyItems.forwardedTo,
      nodeId: dailyItems.nodeId,
      title: dailyItems.title,
    })
    .from(dailyItems)
    .where(
      and(
        eq(dailyItems.userId, userId),
        lt(dailyItems.day, today),
        isNull(dailyItems.completedAt),
        isNull(dailyItems.forwardedTo),
      ),
    )
    .orderBy(asc(dailyItems.day), asc(dailyItems.sortKey));

  const moving = new Set(itemsToForward(candidates, today));
  if (moving.size === 0) return 0;

  const rows = candidates.filter((row) => moving.has(row.id));

  await db.transaction(async (tx) => {
    let sortKey = await endOfDay(tx, userId, today);

    for (const row of rows) {
      await tx
        .update(dailyItems)
        .set({ forwardedTo: today, updatedAt: new Date() })
        .where(and(eq(dailyItems.id, row.id), eq(dailyItems.userId, userId)));

      await tx.insert(dailyItems).values({
        userId,
        day: today,
        nodeId: row.nodeId,
        title: row.title,
        // Today gets its own ABC. What was essential on Tuesday is a fresh question today.
        state: row.state,
        sortKey,
      });

      // Carrying a task over is re-planning it for today, so its target start date comes
      // with it — the one place a start date you sailed past gets bumped, which is how a
      // task you meant to begin on Tuesday is still in front of you on Thursday rather
      // than stranded on Tuesday's page.
      // Not for a node that is shelved past today: bumping its start to today would put a
      // plan before its availability, which `nodes_start_not_before_deferred` rejects — and
      // this runs unattended, so a rejection here would take the whole forward down with it.
      // Compared as UTC calendar days, matching `isDeferred`.
      if (row.nodeId) {
        const date = new Date(`${today}T00:00:00`);
        await tx
          .update(nodes)
          .set({ targetStartDate: date, targetEndDate: date, updatedAt: new Date() })
          .where(
            and(
              eq(nodes.id, row.nodeId),
              eq(nodes.userId, userId),
              sql`(${nodes.deferredDate} is null or (${nodes.deferredDate} at time zone 'UTC')::date <= ${today}::date)`,
            ),
          );
      }

      sortKey = between(sortKey, null);
    }
  });

  return rows.length;
}

/**
 * Write the day's journal entry, creating the note on first keystroke.
 *
 * A journal entry is an ordinary row in `notes` — same table, same markdown editor, same
 * tree — distinguished only by `subject = "Journal"` and its `noteDate`. That means diary
 * entries browse, search and nest alongside every other note instead of living in a second
 * parallel notes system.
 */
export async function saveJournal(
  userId: string,
  day: string,
  body: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: notes.id })
      .from(notes)
      .where(
        and(
          eq(notes.userId, userId),
          eq(notes.subject, JOURNAL_SUBJECT),
          sql`${notes.noteDate}::date = ${day}::date`,
        ),
      )
      .orderBy(asc(notes.createdAt))
      .limit(1);

    if (existing) {
      await tx
        .update(notes)
        .set({ body, updatedAt: new Date() })
        .where(and(eq(notes.id, existing.id), eq(notes.userId, userId)));
      return existing.id;
    }

    const [last] = await tx
      .select({ sortKey: notes.sortKey })
      .from(notes)
      .where(and(eq(notes.userId, userId), isNull(notes.parentId)))
      .orderBy(sql`${notes.sortKey} desc`)
      .limit(1);

    const [created] = await tx
      .insert(notes)
      .values({
        userId,
        parentId: null,
        sortKey: between(last?.sortKey ?? null, null),
        title: day,
        subject: JOURNAL_SUBJECT,
        body,
        noteDate: new Date(`${day}T12:00:00Z`),
      })
      .returning({ id: notes.id });

    return created.id;
  });
}
