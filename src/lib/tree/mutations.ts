import { db } from "@/db";
import {
  dailyItems,
  goalDetails,
  nodes,
  projectDetails,
  resultAreaDetails,
  taskCompletions,
  taskDetails,
} from "@/db/schema";
import type { ExternalRef, NodeState, NodeType, PriorityLetter } from "@/db/schema";
import { and, asc, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { addDays, daysBetween, startOfDay } from "@/lib/dateMath";
import { nextDue } from "@/lib/recurrence/nextDue";
import { nextOccurrence } from "@/lib/recurrence/pattern";
import { toDateKey } from "@/lib/schedule/geometry";
import { syncDayLineToTargetStart } from "@/lib/day/sync";
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
  /**
   * Provenance, for rows imported from outside the app. One object rather than two loose
   * strings so an id can never arrive without the source that qualifies it — the unique
   * index in `schema.ts` treats a null source as distinct, so that pairing is an
   * invariant the type system should be keeping, not a convention.
   */
  external?: ExternalRef;
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
    external,
    position = { at: "last" },
  } = params;

  return db.transaction(async (tx) => {
    const parentType = parentId ? (await requireNode(tx, userId, parentId)).type : null;
    assertCanNest(type, parentType);

    const sortKey = await sortKeyFor(tx, userId, parentId, position);

    const [created] = await tx
      .insert(nodes)
      .values({
        userId,
        parentId,
        type,
        name,
        notes,
        isInbox,
        sortKey,
        externalSource: external?.source ?? null,
        externalId: external?.id ?? null,
      })
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
 * The date the pattern is *about*: the deadline if there is one, else the deferred date,
 * else the target start.
 *
 * A deadline is the date a repeating task is named for — "the report is due every Friday"
 * means Friday is the deadline, not the day you start. Only when there is no deadline does
 * the defer date take over as the thing the schedule moves, and it is what a routine with
 * no dates at all ends up using.
 */
function anchorOf(r: Recurrence): Date | null {
  return r.deadline ?? r.deferredDate ?? r.targetStartDate;
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
 * are **created** when they were empty, and the split is the same one Achieve makes:
 *
 * - **Target start and deferred date are always set.** The next occurrence exists from the
 *   moment you complete this one, so it has to sit somewhere — Achieve's regenerated item
 *   comes back with both filled in and its deadline still None. The deferred date is also
 *   the only thing that takes a finished routine out of the Task Chooser, so without it a
 *   deadline-anchored task could be ticked twice in one day.
 * - **A deadline is only ever advanced, never invented.** This is the rule the whole
 *   feature rests on: "should be done ASAP" is not a deadline, and a routine that quietly
 *   acquired one would start competing with taxes and bills in Overdue.
 * - **Target end and the reminder are only moved.** Both describe something the task did
 *   not necessarily have — a window, a nudge — and inventing either means inventing a
 *   duration or an alarm nobody asked for.
 *
 * The same rule governs "Plan for day", one level up in `syncDayLineOnCompletion`: a day
 * you had planned moves, a day you had not is not chosen for you.
 */
function moveDates(r: Recurrence, shift: number, next: Date) {
  const move = (date: Date | null) => (date ? addDays(date, shift) : null);

  const deferredDate = move(r.deferredDate) ?? next;
  const targetStartDate = move(r.targetStartDate) ?? next;

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
  if (r.end === "until" && r.endUntil) return startOfDay(next) > startOfDay(r.endUntil);
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
  const now = at;

  if (state !== "completed") {
    await tx
      .update(nodes)
      .set({ state, completedAt: null, updatedAt: now })
      .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
    await reopenDayLine(tx, userId, nodeId, now);
    return;
  }

  const recurrence = await recurrenceOf(tx, userId, nodeId);

  async function finish() {
    await tx
      .update(nodes)
      .set({ state, completedAt: now, updatedAt: now })
      .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
  }

  if (!recurrence) {
    await finish();
    await syncDayLineOnCompletion(tx, userId, nodeId, now);
    return;
  }

  const anchor = anchorOf(recurrence);
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
    await tx
      .update(taskDetails)
      .set({ dateCompleted: now })
      .where(eq(taskDetails.nodeId, nodeId));
    // The series is over, so nothing follows it onto a future day — but the day line still
    // gets checked off, exactly as it would for any other task being finished.
    await syncDayLineOnCompletion(tx, userId, nodeId, now);
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
  const dates = moveDates(recurrence, shift, next!);

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

  await tx
    .update(taskDetails)
    .set({ dateCompleted: now, ...dates.task })
    .where(eq(taskDetails.nodeId, nodeId));

  await syncDayLineOnCompletion(tx, userId, nodeId, now);
  await syncDayLineToTargetStart(tx, userId, nodeId);
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

  const today = toDateKey(completedAt);
  const open = rows.find((r) => r.completedAt === null && r.forwardedTo === null);
  // Judged by when it was completed rather than which day it sits on, so ticking Monday's
  // forgotten line today still counts as today's record.
  const doneToday = rows.find(
    (r) => r.completedAt && toDateKey(r.completedAt) === today,
  );

  if (open) {
    await tx
      .update(dailyItems)
      .set({ state: "completed", completedAt, updatedAt: completedAt })
      .where(eq(dailyItems.id, open.id));
  } else if (!doneToday) {
    await addDayLine(tx, userId, nodeId, today, {
      state: "completed",
      completedAt,
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

  const today = toDateKey(now);
  const doneToday = rows.find(
    (r) => r.completedAt && toDateKey(r.completedAt) === today,
  );
  if (!doneToday) return;

  await tx
    .update(dailyItems)
    .set({ state: "not_started", completedAt: null, updatedAt: now })
    .where(eq(dailyItems.id, doneToday.id));

  // The line is open again on today, so the task's target start date has to say today —
  // that column is what decides which day a task sits on, and reopening something you
  // finished this morning is a statement that you are still doing it today.
  //
  // Which also un-shelves it. A routine ticked this morning was deferred to its next
  // occurrence on the way out; saying you are still doing it today contradicts that, and
  // leaving the shelf in place would both hide it from the Chooser and put a plan before
  // its availability, which the constraint rejects. Only a *future* shelf is cleared — a
  // date already past is inert and is left as the record of the last cycle.
  const startOfToday = startOfDay(now);
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

export async function setState(
  userId: string,
  nodeId: string,
  state: NodeState,
): Promise<void> {
  await db.transaction((tx) => applyStateTransition(tx, userId, nodeId, state));
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
    const anchor = anchorOf(recurrence);
    const next = nextAnchor(recurrence, anchor, now);

    // Skipping cannot exhaust an "end after N" series, because it never counted toward
    // one. Only an unsatisfiable pattern, or an `until` date the next occurrence is past,
    // leaves nowhere to go.
    const pastEnd =
      recurrence.end === "until" &&
      recurrence.endUntil != null &&
      next != null &&
      startOfDay(next) > startOfDay(recurrence.endUntil);

    if (!next || pastEnd) {
      throw new Error("This series has no occurrences left to skip to.");
    }

    // The same date rule as a completion, from the same function — skipping is a
    // completion with the "you did it" half removed, and the two must not drift.
    const dates = moveDates(recurrence, anchor ? daysBetween(anchor, next) : 0, next);

    await tx
      .update(nodes)
      .set({ ...dates.node, state: "postponed", updatedAt: now })
      .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));

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
