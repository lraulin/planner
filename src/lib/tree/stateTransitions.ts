import { db } from "@/db";
import { dailyItems, nodes, taskCompletions, taskDetails } from "@/db/schema";
import type { NodeState, PriorityLetter } from "@/db/schema";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { daysBetween } from "@/lib/dateMath";
import { isDeferred } from "@/lib/recurrence/nextDue";
import { recurrenceAnchor } from "@/lib/recurrence/anchor";
import { fromDateKey, localDateKey } from "@/lib/schedule/geometry";
import {
  clearConflictingDescendantPlans,
  syncDayLineToTargetStart,
} from "@/lib/day/sync";
import { cascadeStateChange, type CascadeNode } from "./completionCascade";
import { rearmReminders } from "@/lib/reminders/arm";
import { between } from "./sortKey";
import { assertSupportsLifecycleState } from "./lifecycle";
import { subtreeIds, type Executor } from "./nodeRows";
import { moveDates, nextAnchor, recurrenceOf, seriesEnds } from "./recurrenceCycle";
import { applySettlePriorityClear } from "./priorityWrites";

/**
 * Writes for a node's state: completion and cancellation, the day lines that record them,
 * and the cascade that brings the rest of the branch into line. Every write scopes on
 * `userId`.
 */

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
    .select({ type: nodes.type, deferredDate: nodes.deferredDate })
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
    // Shelving by hand onto a deferred date that has already gone by would un-shelve the row
    // the instant it was shelved, since expiry is derived — and a routine that came back is
    // still *stored* postponed, so the write changed nothing at all. Choosing Postponed means
    // an indefinite shelf, so the stale date goes (`date-model.md`). A future date stays: it
    // is the shelf's expiry. The drawer applies the same rule in `saveNodeDetail`, which writes
    // the state itself rather than coming through here.
    const staleShelf =
      state === "postponed" && !isDeferred(node.deferredDate, localDateKey(now));
    await tx
      .update(nodes)
      .set({
        state,
        completedAt: null,
        ...(staleShelf && node.deferredDate ? { deferredDate: null } : {}),
        updatedAt: now,
      })
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

  const anchor = recurrenceAnchor(recurrence, completedDayKey);
  const next = nextAnchor(recurrence, anchor, now);

  // Counted before the insert below, or "end after N occurrences" is off by one.
  const [{ value: completionsSoFar }] = await tx
    .select({ value: count() })
    .from(taskCompletions)
    .where(and(eq(taskCompletions.userId, userId), eq(taskCompletions.nodeId, nodeId)));

  await tx.insert(taskCompletions).values({ userId, nodeId, completedAt: now });

  // The one path on which a repeating task stays completed: its series is over. Its dates
  // are left where they are, so the record reads as the last occurrence rather than as one
  // that never happened. No next occurrence at all ends it too.
  if (!next || seriesEnds(recurrence, next, completionsSoFar)) {
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
  const shift = anchor ? daysBetween(anchor, next) : 0;
  const dates = moveDates(recurrence, shift, next, completedDayKey);

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
  const touched = [nodeId];
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
      touched.push(change.id);
    }
  });
  // A completion settles reminders, and a repeating task's completion moves one.
  await rearmReminders(
    userId,
    touched.map((id) => ({ kind: "node" as const, id })),
  );
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
