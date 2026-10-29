import type {
  AppointmentCheck,
  NodeState,
  RecurrenceEnd,
  RecurrenceFrequency,
  ReminderSourceKind,
} from "@/db/schema";
import { expandRecurrence } from "@/lib/schedule/recurrence";
import { shiftDateKey, toDateKey, zonedDateKey } from "@/lib/schedule/geometry";
import { zonedWallTime } from "@/lib/schedule/zonedTime";
import type { NotificationPrefs } from "@/lib/settings/notifications";

/**
 * Which reminder occurrences a source wants, and whether an armed one is still wanted.
 *
 * Pure: every function takes the source as loaded, the user's preferences and the zone, and
 * the database layer (`mutations.ts`) does the reading and writing around it. The one idea
 * that holds it together is the **occurrence key** — what the source wants to be alerted
 * about *and when*. Arming inserts keys; a changed source produces different keys; and a
 * row whose key the source no longer produces is stale, whatever state it is in.
 *
 * Spec: `agent-os/specs/2026-10-28-2101-reminders-and-push-notifications/`.
 */

/** Fire times in `[from, to)`. */
export type FireWindow = { from: Date; to: Date };

export type DesiredOccurrence = {
  sourceKind: ReminderSourceKind;
  sourceId: string;
  occurrenceKey: string;
  dueAt: Date;
  scheduledFor: Date;
  title: string;
  detail: string;
};

/** The arming horizon: QStash's free plan delays a message by at most seven days. */
export const ARM_HORIZON_DAYS = 7;

/**
 * How far behind "now" arming still reaches. A reminder set for a minute ago fires at once
 * rather than never; one from yesterday is history, not a reminder.
 */
export const ARM_GRACE_MS = 5 * 60_000;

export function armWindow(now: Date): FireWindow {
  return {
    from: new Date(now.getTime() - ARM_GRACE_MS),
    to: new Date(now.getTime() + ARM_HORIZON_DAYS * 24 * 60 * 60_000),
  };
}

/**
 * The window an armed row is checked against: exactly the instant it was armed for. Asking
 * the source "do you still want an alert at this moment" is window-independent for a task
 * and is the only question that makes sense for one occurrence of a repeating appointment.
 */
export function pointWindow(at: Date): FireWindow {
  return { from: at, to: new Date(at.getTime() + 1) };
}

function inWindow(at: Date, window: FireWindow): boolean {
  return at >= window.from && at < window.to;
}

function timeLabel(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

/** "Fri, Oct 30" — for a calendar day already encoded as UTC noon. */
function dayLabel(day: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(day);
}

// ---------------------------------------------------------------------------------------
// Tasks and projects

export type NodeReminderSource = {
  id: string;
  kind: "task" | "project";
  name: string;
  /** Null only for kinds without a lifecycle, which never reach here; kept honest to the column. */
  state: NodeState | null;
  deadline: Date | null;
  reminderAt: Date | null;
};

/**
 * Settled work has nothing left to be reminded of. Postponed is **not** settled: a repeating
 * task shelves itself until its next occurrence, and that occurrence's reminder is the point.
 */
function isSettled(state: NodeState | null): boolean {
  return state === "completed" || state === "cancelled";
}

export function nodeOccurrences(
  source: NodeReminderSource,
  prefs: NotificationPrefs,
  window: FireWindow,
): DesiredOccurrence[] {
  const at = source.reminderAt;
  if (!prefs.tasks || at === null || isSettled(source.state) || !inWindow(at, window)) {
    return [];
  }
  const kindLabel = source.kind === "task" ? "Task" : "Project";
  return [
    {
      sourceKind: source.kind,
      sourceId: source.id,
      occurrenceKey: at.toISOString(),
      dueAt: at,
      scheduledFor: at,
      title: source.name.trim() || `Untitled ${source.kind}`,
      detail: source.deadline
        ? `${kindLabel} · deadline ${dayLabel(source.deadline)}`
        : kindLabel,
    },
  ];
}

// ---------------------------------------------------------------------------------------
// Appointments and project blocks

export type AppointmentReminderSource = {
  id: string;
  subject: string;
  location: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  checkState: AppointmentCheck;
  projectId: string | null;
  reminderMinutes: number | null;
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceInterval: number;
  recurrenceByWeekday: number[] | null;
  recurrenceEnd: RecurrenceEnd;
  recurrenceCount: number | null;
  recurrenceUntil: Date | null;
  externalSeriesId: string | null;
};

/**
 * Minutes before start this appointment alerts, or null for never.
 *
 * Its own reminder wins. Failing that, a project block alerts at the configured lead — the
 * Achieve behaviour. A plain event with no reminder set here does not alert: almost all of
 * them are Google-mirrored, and Google already alerts for its own.
 */
export function appointmentLeadMinutes(
  source: Pick<AppointmentReminderSource, "reminderMinutes" | "projectId">,
  prefs: NotificationPrefs,
): number | null {
  if (source.reminderMinutes !== null) return Math.max(0, source.reminderMinutes);
  if (source.projectId !== null) return prefs.projectBlockLeadMinutes;
  return null;
}

export function appointmentOccurrences(
  source: AppointmentReminderSource,
  prefs: NotificationPrefs,
  window: FireWindow,
  timeZone: string,
): DesiredOccurrence[] {
  const lead = appointmentLeadMinutes(source, prefs);
  if (!prefs.appointments || lead === null) return [];

  const leadMs = lead * 60_000;
  // Expand by *start*, since that is what the series is defined on, over the window shifted
  // by the lead; then keep what actually fires inside the window.
  const occurrences = expandRecurrence(
    source,
    new Date(window.from.getTime() + leadMs),
    new Date(window.to.getTime() + leadMs),
  );

  const isBlock = source.projectId !== null;
  const out: DesiredOccurrence[] = [];
  for (const occurrence of occurrences) {
    if (occurrence.checkState !== "open") continue;
    const fireAt = new Date(occurrence.startAt.getTime() - leadMs);
    if (!inWindow(fireAt, window)) continue;
    const when = source.allDay ? "All day" : timeLabel(occurrence.startAt, timeZone);
    const where = source.location.trim();
    out.push({
      sourceKind: "appointment",
      sourceId: source.id,
      // The start names the occurrence of a repeating series; the fire time is in the key so
      // a changed lead arms a new row instead of leaving the old one armed at the old time.
      occurrenceKey: `${occurrence.startAt.toISOString()}@${fireAt.toISOString()}`,
      dueAt: occurrence.startAt,
      scheduledFor: fireAt,
      title: source.subject.trim() || "Appointment",
      detail: [isBlock ? `Project block · ${when}` : when, where]
        .filter(Boolean)
        .join(" · "),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Bills

export type BillReminderSource = {
  id: string;
  name: string;
  active: boolean;
  /**
   * The posting being waited for (`BillAnchor.expectedKey`): due minus lead days for a bill
   * that declares a due day, the predicted posting otherwise. A charge that pays it moves this
   * to the next occurrence, which is exactly what makes an armed alert for the old date stale.
   */
  expectedKey: string | null;
  expectedCents: number | null;
};

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
}

export function billOccurrences(
  source: BillReminderSource,
  prefs: NotificationPrefs,
  window: FireWindow,
  timeZone: string,
): DesiredOccurrence[] {
  if (!prefs.bills || !source.active || source.expectedKey === null) return [];
  const fireAt = zonedWallTime(source.expectedKey, prefs.morningMinute, timeZone);
  if (!inWindow(fireAt, window)) return [];
  return [
    {
      sourceKind: "bill",
      sourceId: source.id,
      occurrenceKey: `${source.expectedKey}@${fireAt.toISOString()}`,
      dueAt: fireAt,
      scheduledFor: fireAt,
      title: `${source.name} hasn't been charged`,
      detail:
        source.expectedCents === null
          ? "Expected today"
          : `Expected today · ${money(source.expectedCents)}`,
    },
  ];
}

// ---------------------------------------------------------------------------------------
// Ready to Assign

/** The one Ready to Assign occurrence for a negative episode, fired the moment it is seen. */
export function readyToAssignOccurrence(
  userId: string,
  readyToAssignCents: number,
  now: Date,
): DesiredOccurrence {
  return {
    sourceKind: "ready_to_assign",
    sourceId: userId,
    occurrenceKey: now.toISOString(),
    dueAt: now,
    scheduledFor: now,
    title: "Ready to Assign is negative",
    detail: `${money(readyToAssignCents)} — more is assigned than you have`,
  };
}

// ---------------------------------------------------------------------------------------
// Validity

export type ArmedOccurrence = {
  sourceKind: ReminderSourceKind;
  sourceId: string;
  occurrenceKey: string;
};

/**
 * Whether an armed row is one its source still wants, given what the source produces for
 * the row's own `scheduledFor` (see `pointWindow`).
 *
 * This is the whole guard against stale callbacks and stale panel rows: a deleted task
 * produces nothing, a completed one produces nothing, a moved reminder produces a different
 * key, a paid bill has moved its expected date on. None of them needs to cancel anything.
 */
export function isStillDue(
  row: ArmedOccurrence,
  desired: DesiredOccurrence[],
): boolean {
  return desired.some(
    (d) =>
      d.sourceKind === row.sourceKind &&
      d.sourceId === row.sourceId &&
      d.occurrenceKey === row.occurrenceKey,
  );
}

// ---------------------------------------------------------------------------------------
// Deadline → auto-set reminder

/** Achieve's auto-set reminder: N days before the deadline day, at the configured time. */
export function autoReminderFor(
  deadline: Date,
  prefs: NotificationPrefs,
  timeZone: string,
): Date {
  return zonedWallTime(
    shiftDateKey(toDateKey(deadline), -prefs.autoReminderDays),
    prefs.autoReminderMinute,
    timeZone,
  );
}

/**
 * What a deadline change does to the reminder: a new instant, `null` to clear it, or
 * `undefined` to leave it alone.
 *
 * Only a reminder that is empty or **still the auto value for the old deadline** follows the
 * deadline. Anything else was set by hand, and a hand-set reminder is never overwritten —
 * which is also why the rule needs no flag column: being equal to the auto value *is* the
 * flag, and editing the reminder by a minute clears it.
 */
export function reminderAfterDeadlineChange(
  change: {
    previousDeadline: Date | null;
    nextDeadline: Date | null;
    reminderAt: Date | null;
  },
  prefs: NotificationPrefs,
  timeZone: string,
): Date | null | undefined {
  if (!prefs.autoReminder) return undefined;
  const { previousDeadline, nextDeadline, reminderAt } = change;
  if (sameDay(previousDeadline, nextDeadline)) return undefined;

  const wasAuto =
    reminderAt === null ||
    (previousDeadline !== null &&
      reminderAt.getTime() ===
        autoReminderFor(previousDeadline, prefs, timeZone).getTime());
  if (!wasAuto) return undefined;

  if (nextDeadline === null) return reminderAt === null ? undefined : null;
  return autoReminderFor(nextDeadline, prefs, timeZone);
}

function sameDay(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return toDateKey(a) === toDateKey(b);
}

// ---------------------------------------------------------------------------------------
// Snooze

export const SNOOZE_CHOICES = ["5m", "15m", "1h", "tomorrow"] as const;
export type SnoozeChoice = (typeof SNOOZE_CHOICES)[number];

export const SNOOZE_LABELS: Record<SnoozeChoice, string> = {
  "5m": "5 min",
  "15m": "15 min",
  "1h": "1 hour",
  // The morning time is a preference; "Tomorrow" is the label, the time is in Settings.
  tomorrow: "Tomorrow",
};

export function isSnoozeChoice(value: unknown): value is SnoozeChoice {
  return (SNOOZE_CHOICES as readonly unknown[]).includes(value);
}

/** When a snoozed reminder comes back. "Tomorrow" is the reader's tomorrow, at the morning time. */
export function snoozeTarget(
  choice: SnoozeChoice,
  now: Date,
  prefs: NotificationPrefs,
  timeZone: string,
): Date {
  switch (choice) {
    case "5m":
      return new Date(now.getTime() + 5 * 60_000);
    case "15m":
      return new Date(now.getTime() + 15 * 60_000);
    case "1h":
      return new Date(now.getTime() + 60 * 60_000);
    case "tomorrow":
      return zonedWallTime(
        shiftDateKey(zonedDateKey(now, timeZone), 1),
        prefs.morningMinute,
        timeZone,
      );
  }
}
