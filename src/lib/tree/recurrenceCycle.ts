import { db } from "@/db";
import { nodes, taskDetails } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { addDays, daysBetween } from "@/lib/dateMath";
import { nextDue } from "@/lib/recurrence/nextDue";
import { recurrenceAnchor } from "@/lib/recurrence/anchor";
import { nextOccurrence } from "@/lib/recurrence/pattern";
import { asCalendarDay, localDateKey, toDateKey } from "@/lib/schedule/geometry";
import {
  clearConflictingDescendantPlans,
  syncDayLineToTargetStart,
} from "@/lib/day/sync";
import { READER_TIME_ZONE } from "@/lib/schedule/readerZone";
import { shiftZonedDays } from "@/lib/schedule/zonedTime";
import { rearmReminders } from "@/lib/reminders/arm";
import type { Executor } from "./nodeRows";

/**
 * How a repeating task steps to its next occurrence: the rule, the dates it moves, and when
 * the series ends. Completion (`stateTransitions.ts`) and Skip Recurrence share these, so the
 * two cannot drift. Every read and write scopes on `userId`.
 */

/**
 * Everything the completion path needs about a repeating task: its rule, the dates the
 * rule moves, and how the series ends.
 *
 * Returns null for everything else — a project, a goal, a task with recurrence off — which
 * is the overwhelmingly common case and the one that must stay on the plain path.
 */
export async function recurrenceOf(tx: Executor, userId: string, nodeId: string) {
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
 * Where the whole date set moves to, or null when the series has run out.
 *
 * The two modes differ only in what they measure from, and that difference is the feature:
 * `scheduled` steps on from this occurrence's own anchor, so completing early buys time and
 * completing late still leaves you owing the one you missed; `regenerate` steps on from the
 * completion, so no amount of brushing your teeth today changes tomorrow.
 */
export function nextAnchor(
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
export function moveDates(r: Recurrence, shift: number, next: Date, asOfDay: string) {
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
      // The reminder is an instant, not a calendar day: it moves by the same whole days and
      // keeps its time of day on the reader's clock. Re-encoding it as a calendar day (UTC
      // noon) turned a 3 PM reminder into an 8 AM one on the first cycle.
      reminderAt: r.reminderAt
        ? shiftZonedDays(r.reminderAt, shift, READER_TIME_ZONE)
        : null,
    },
  };
}

/**
 * Whether this completion is the series' last, so the task finishes for real instead of
 * cycling. `completionsSoFar` excludes the completion being recorded right now.
 */
export function seriesEnds(
  r: Recurrence,
  next: Date,
  completionsSoFar: number,
): boolean {
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
    const anchor = recurrenceAnchor(recurrence, localDateKey(now));
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
  await rearmReminders(userId, [{ kind: "node", id: nodeId }]);
}
