import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  reminderOccurrences,
  type ReminderOccurrence,
  type ReminderSourceKind,
} from "@/db/schema";
import { loadBudget } from "@/lib/finances/budget/queries";
import { READER_TIME_ZONE, readerTodayKey } from "@/lib/schedule/readerZone";
import type { NotificationPrefs } from "@/lib/settings/notifications";
import {
  appointmentOccurrences,
  armWindow,
  billOccurrences,
  isStillDue,
  nodeOccurrences,
  pointWindow,
  readyToAssignOccurrence,
  type AppointmentReminderSource,
  type BillReminderSource,
  type DesiredOccurrence,
  type FireWindow,
  type NodeReminderSource,
} from "./derive";
import { publishFire } from "./publish";
import { isCompletable, pushToUser, REMINDERS_PANEL_URL } from "./push";
import {
  listOpenOccurrences,
  loadAppointmentReminderSources,
  loadBillReminderSources,
  loadNodeReminderSources,
  loadNotificationPrefs,
  type OpenOccurrence,
} from "./queries";

/**
 * Arming and firing reminder occurrences — the part every writer calls.
 *
 * Kept apart from `mutations.ts` (acting on a reminder from the panel) for one reason: the
 * tree and schedule writers call into this module to re-arm what they changed, and completing
 * a reminder calls back into them. With both halves in one file that is an import cycle.
 *
 * `fireOccurrence` and `fireDue` are the only functions here without a `userId`: they are
 * called by the QStash callback and the daily sweep, whose signed message or cron secret is
 * the authority, and the row each one names carries its own `user_id`.
 *
 * Spec: `agent-os/specs/2026-10-28-2101-reminders-and-push-notifications/`.
 */

/**
 * A source an occurrence can be armed from. Tasks and projects are both `node`: they load
 * by id from one table whatever their type. Ready to Assign is not a source — see
 * `checkReadyToAssign`.
 */
export type SourceRef = {
  kind: "node" | "appointment" | "bill";
  id: string;
};

/** The source an armed row came from. */
export function sourceRefOf(row: {
  sourceKind: ReminderSourceKind;
  sourceId: string;
}): SourceRef | null {
  switch (row.sourceKind) {
    case "task":
    case "project":
      return { kind: "node", id: row.sourceId };
    case "appointment":
    case "bill":
      return { kind: row.sourceKind, id: row.sourceId };
    case "ready_to_assign":
      return null;
  }
}

type Context = { prefs: NotificationPrefs; timeZone: string; now: Date };

type LoadedSources = {
  nodes: NodeReminderSource[];
  appointments: AppointmentReminderSource[];
  bills: BillReminderSource[];
};

async function contextFor(userId: string, now: Date): Promise<Context> {
  return {
    prefs: await loadNotificationPrefs(userId),
    timeZone: READER_TIME_ZONE,
    now,
  };
}

function occurrencesOf(
  loaded: LoadedSources,
  ctx: Context,
  window: FireWindow,
  only?: { kind: OpenOccurrence["sourceKind"]; id: string },
): DesiredOccurrence[] {
  const wanted = (kind: string, id: string) =>
    !only || (only.id === id && (only.kind === kind || kind === "node"));
  const out: DesiredOccurrence[] = [];
  for (const source of loaded.nodes) {
    if (wanted("node", source.id))
      out.push(...nodeOccurrences(source, ctx.prefs, window));
  }
  for (const source of loaded.appointments) {
    if (wanted("appointment", source.id)) {
      out.push(...appointmentOccurrences(source, ctx.prefs, window, ctx.timeZone));
    }
  }
  for (const source of loaded.bills) {
    if (wanted("bill", source.id)) {
      out.push(...billOccurrences(source, ctx.prefs, window, ctx.timeZone));
    }
  }
  return out;
}

/** Whether an armed row is one its source still wants — `isStillDue` at its own instant. */
function stillWanted(
  row: OpenOccurrence,
  loaded: LoadedSources,
  ctx: Context,
): boolean {
  const desired = occurrencesOf(loaded, ctx, pointWindow(row.scheduledFor), {
    kind: row.sourceKind,
    id: row.sourceId,
  });
  return isStillDue(row, desired);
}

async function loadSources(
  userId: string,
  ctx: Context,
  filter: { refs: readonly SourceRef[]; window?: FireWindow; allBills?: boolean },
): Promise<LoadedSources> {
  const ids = (kinds: SourceRef["kind"][]) =>
    filter.refs.filter((ref) => kinds.includes(ref.kind)).map((ref) => ref.id);
  const nodeIds = ids(["node"]);
  const appointmentIds = ids(["appointment"]);
  const billIds = new Set(ids(["bill"]));
  const needBills = filter.allBills || billIds.size > 0;

  const [nodeSources, appointmentSources, billSources] = await Promise.all([
    loadNodeReminderSources(userId, { ids: nodeIds, window: filter.window }),
    loadAppointmentReminderSources(userId, {
      ids: appointmentIds,
      window: filter.window,
    }),
    needBills
      ? loadBillReminderSources(userId, readerTodayKey(ctx.now))
      : Promise.resolve([]),
  ]);
  return {
    nodes: nodeSources,
    appointments: appointmentSources,
    bills: filter.allBills
      ? billSources
      : billSources.filter((bill) => billIds.has(bill.id)),
  };
}

/**
 * Bring the stored occurrences in line with what the loaded sources want: supersede every
 * open row its source no longer produces, and arm (insert and publish) every wanted one in
 * the horizon that is not already there.
 *
 * Arming is idempotent through the unique `(user, kind, source, key)` index. A key that
 * exists in any state is left alone — a dismissed reminder does not come back, a snoozed
 * one keeps its snooze — except a `superseded` row, which is revived: a reminder moved to
 * 4:00 and back to 3:00 is the 3:00 reminder again.
 */
async function reconcile(
  userId: string,
  loaded: LoadedSources,
  open: readonly OpenOccurrence[],
  ctx: Context,
): Promise<{ armed: number; superseded: number }> {
  const stale = open
    .filter((row) => row.sourceKind !== "ready_to_assign")
    .filter((row) => !stillWanted(row, loaded, ctx))
    .map((row) => row.id);

  if (stale.length > 0) {
    await db
      .update(reminderOccurrences)
      .set({ state: "superseded", updatedAt: ctx.now })
      .where(
        and(
          eq(reminderOccurrences.userId, userId),
          inArray(reminderOccurrences.id, stale),
        ),
      );
  }

  const desired = occurrencesOf(loaded, ctx, armWindow(ctx.now));
  if (desired.length === 0) return { armed: 0, superseded: stale.length };

  const armed = await db
    .insert(reminderOccurrences)
    .values(
      desired.map((d) => ({
        userId,
        sourceKind: d.sourceKind,
        sourceId: d.sourceId,
        occurrenceKey: d.occurrenceKey,
        dueAt: d.dueAt,
        scheduledFor: d.scheduledFor,
        fireAt: d.scheduledFor,
        title: d.title,
        detail: d.detail,
      })),
    )
    .onConflictDoUpdate({
      target: [
        reminderOccurrences.userId,
        reminderOccurrences.sourceKind,
        reminderOccurrences.sourceId,
        reminderOccurrences.occurrenceKey,
      ],
      set: {
        state: "scheduled",
        fireAt: sql`excluded.scheduled_for`,
        firedAt: null,
        title: sql`excluded.title`,
        detail: sql`excluded.detail`,
        updatedAt: ctx.now,
      },
      setWhere: eq(reminderOccurrences.state, "superseded"),
    })
    .returning({ id: reminderOccurrences.id, fireAt: reminderOccurrences.fireAt });

  await publishAll(armed);
  return { armed: armed.length, superseded: stale.length };
}

/**
 * Publish each newly armed row. A failure is logged, not thrown: the row is stored either
 * way, and the daily sweep fires any `scheduled` row whose time has passed, so a lost publish
 * costs lateness, not the reminder.
 */
export async function publishAll(
  rows: readonly { id: string; fireAt: Date }[],
): Promise<void> {
  await Promise.all(
    rows.map((row) =>
      publishFire(row).catch((error: unknown) => {
        console.error("[reminders] publish failed", row.id, error);
      }),
    ),
  );
}

/**
 * Re-arm the reminders of the given sources after they were written. The single entry point
 * every writer calls — forms, agent tools, recurrence cycling, appointment edits, Google's
 * inbound pull, bill edits — so "what fires" is derived in one place.
 */
export async function syncReminderSources(
  userId: string,
  refs: readonly SourceRef[],
  now: Date = new Date(),
): Promise<{ armed: number; superseded: number }> {
  if (refs.length === 0) return { armed: 0, superseded: 0 };
  const ctx = await contextFor(userId, now);
  const ids = [...new Set(refs.map((ref) => ref.id))];
  const [loaded, open] = await Promise.all([
    loadSources(userId, ctx, { refs }),
    listOpenOccurrences(userId, ids),
  ]);
  return reconcile(userId, loaded, open, ctx);
}

/**
 * {@link syncReminderSources} for a writer whose own work has already committed.
 *
 * Arming is a side effect of the save, not part of it: a failure here must not report a
 * saved task as unsaved. It is logged rather than thrown because there is a backstop — the
 * daily sweep re-arms every source in the horizon — so the worst case is a reminder armed
 * the next morning instead of now.
 */
export async function rearmReminders(
  userId: string,
  refs: readonly SourceRef[],
): Promise<void> {
  try {
    await syncReminderSources(userId, refs);
  } catch (error) {
    console.error("[reminders] re-arm failed", refs, error);
  }
}

/** Arm everything due in the next seven days and drop what went stale. The daily sweep. */
export async function armHorizon(
  userId: string,
  now: Date = new Date(),
): Promise<{ armed: number; superseded: number }> {
  const ctx = await contextFor(userId, now);
  const open = await listOpenOccurrences(userId);
  const refs = open.flatMap((row) => sourceRefOf(row) ?? []);
  const loaded = await loadSources(userId, ctx, {
    refs,
    window: armWindow(now),
    allBills: true,
  });
  return reconcile(userId, loaded, open, ctx);
}

/**
 * {@link armHorizon} for appointments only, after Google's inbound pull changed some. The pull
 * upserts without returning ids, and a block made on the phone has to be armed without
 * waiting for the morning sweep. Logged rather than thrown, like `rearmReminders`: the pull
 * succeeded, and the sweep is the backstop.
 */
export async function rearmAppointments(userId: string): Promise<void> {
  try {
    const now = new Date();
    const ctx = await contextFor(userId, now);
    const open = (await listOpenOccurrences(userId)).filter(
      (row) => row.sourceKind === "appointment",
    );
    const appointments = await loadAppointmentReminderSources(userId, {
      ids: open.map((row) => row.sourceId),
      window: armWindow(now),
    });
    await reconcile(userId, { nodes: [], appointments, bills: [] }, open, ctx);
  } catch (error) {
    console.error("[reminders] appointment re-arm failed", error);
  }
}

/**
 * Close open reminders whose task, project, appointment or bill no longer exists. One
 * statement, for a delete that removed a whole subtree whose ids the caller never saw.
 */
export async function supersedeOrphanedReminders(userId: string): Promise<void> {
  await db.execute(sql`
    update ${reminderOccurrences}
    set state = 'superseded', updated_at = now()
    where user_id = ${userId}
      and state in ('scheduled', 'fired')
      and (
        (source_kind in ('task', 'project')
          and not exists (select 1 from nodes n where n.id = source_id))
        or (source_kind = 'appointment'
          and not exists (select 1 from appointments a where a.id = source_id))
        or (source_kind = 'bill'
          and not exists (select 1 from finance_budget_categories c where c.id = source_id))
      )
  `);
}

// ---------------------------------------------------------------------------------------
// Firing

export type FireOutcome = "fired" | "stale" | "superseded";

function payloadOf(row: ReminderOccurrence) {
  return {
    occurrenceId: row.id,
    title: row.title,
    body: row.detail,
    url: REMINDERS_PANEL_URL,
    completable: isCompletable(row.sourceKind),
  };
}

/**
 * Fire one armed occurrence, if it is still what was armed.
 *
 * Three guards, in order: the row is still `scheduled` at exactly the `fireAt` the message
 * was published for (an edit, a dismiss or a snooze since then makes this an old message);
 * its source still wants it; and the state change itself is conditional, so two deliveries
 * of the same message cannot both push.
 */
export async function fireOccurrence(
  id: string,
  expectedFireAt: Date,
  now: Date = new Date(),
): Promise<FireOutcome> {
  const [row] = await db
    .select()
    .from(reminderOccurrences)
    .where(eq(reminderOccurrences.id, id))
    .limit(1);
  if (
    !row ||
    row.state !== "scheduled" ||
    row.fireAt.getTime() !== expectedFireAt.getTime()
  ) {
    return "stale";
  }

  const ref = sourceRefOf(row);
  if (ref) {
    const ctx = await contextFor(row.userId, now);
    const loaded = await loadSources(row.userId, ctx, { refs: [ref] });
    if (!stillWanted(row as OpenOccurrence, loaded, ctx)) {
      await db
        .update(reminderOccurrences)
        .set({ state: "superseded", updatedAt: now })
        .where(
          and(
            eq(reminderOccurrences.id, id),
            eq(reminderOccurrences.state, "scheduled"),
          ),
        );
      return "superseded";
    }
  }

  const [fired] = await db
    .update(reminderOccurrences)
    .set({ state: "fired", firedAt: now, updatedAt: now })
    .where(
      and(
        eq(reminderOccurrences.id, id),
        eq(reminderOccurrences.state, "scheduled"),
        eq(reminderOccurrences.fireAt, expectedFireAt),
      ),
    )
    .returning();
  if (!fired) return "stale";

  await pushToUser(fired.userId, payloadOf(fired));
  return "fired";
}

/**
 * Fire every `scheduled` row whose time has come — the daily sweep's catch-up for a callback
 * that never arrived, and `npm run reminders:fire-due` locally, where nothing is published.
 */
export async function fireDue(
  now: Date = new Date(),
): Promise<Record<FireOutcome, number>> {
  const due = await db
    .select({ id: reminderOccurrences.id, fireAt: reminderOccurrences.fireAt })
    .from(reminderOccurrences)
    .where(
      and(
        eq(reminderOccurrences.state, "scheduled"),
        lte(reminderOccurrences.fireAt, now),
      ),
    );
  const counts: Record<FireOutcome, number> = { fired: 0, stale: 0, superseded: 0 };
  for (const row of due) counts[await fireOccurrence(row.id, row.fireAt, now)] += 1;
  return counts;
}

// ---------------------------------------------------------------------------------------
// Ready to Assign

/**
 * Notify once when Ready to Assign is negative, and resolve the notice when it recovers.
 *
 * Called after the writes that change the budget while nobody is looking at it — an import,
 * a bank sync, an alert email — and by the daily sweep. Never after an edit on the budget page:
 * that person is already looking at the red number.
 *
 * Fires immediately rather than through QStash: the moment it is noticed is the time.
 */
export async function checkReadyToAssign(
  userId: string,
  now: Date = new Date(),
): Promise<"notified" | "resolved" | "unchanged"> {
  const [prefs, budget, open] = await Promise.all([
    loadNotificationPrefs(userId),
    loadBudget(userId, null, db, { todayKey: readerTodayKey(now) }),
    db
      .select({ id: reminderOccurrences.id })
      .from(reminderOccurrences)
      .where(
        and(
          eq(reminderOccurrences.userId, userId),
          eq(reminderOccurrences.sourceKind, "ready_to_assign"),
          inArray(reminderOccurrences.state, ["scheduled", "fired"]),
        ),
      ),
  ]);
  if (!budget.configured) return "unchanged";
  const month = budget.months.find((m) => m.month === budget.month);
  if (!month) return "unchanged";

  const negative = month.readyToAssignCents < 0;
  if (!negative || !prefs.readyToAssign) {
    if (open.length === 0) return "unchanged";
    await db
      .update(reminderOccurrences)
      .set({ state: "superseded", updatedAt: now })
      .where(
        and(
          eq(reminderOccurrences.userId, userId),
          inArray(
            reminderOccurrences.id,
            open.map((row) => row.id),
          ),
        ),
      );
    return "resolved";
  }
  if (open.length > 0) return "unchanged";

  const d = readyToAssignOccurrence(userId, month.readyToAssignCents, now);
  const [row] = await db
    .insert(reminderOccurrences)
    .values({
      userId,
      sourceKind: d.sourceKind,
      sourceId: d.sourceId,
      occurrenceKey: d.occurrenceKey,
      dueAt: d.dueAt,
      scheduledFor: d.scheduledFor,
      fireAt: d.scheduledFor,
      state: "fired",
      firedAt: now,
      title: d.title,
      detail: d.detail,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) return "unchanged";
  await pushToUser(userId, payloadOf(row));
  return "notified";
}

/** {@link checkReadyToAssign} after a write that has already succeeded. See `rearmReminders`. */
export async function checkReadyToAssignQuietly(userId: string): Promise<void> {
  try {
    await checkReadyToAssign(userId);
  } catch (error) {
    console.error("[reminders] Ready to Assign check failed", error);
  }
}
