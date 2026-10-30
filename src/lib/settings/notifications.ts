import { asBoolean, asClampedNumber, asRecord } from "./parse";
import { SETTINGS_VERSION } from "./scopes";

/**
 * Reminder preferences — the `notifications` scope.
 *
 * Read on the server when reminders are armed, so every field has a default that does
 * something sensible for an account that has never opened the Notifications section.
 */

/**
 * Minutes before a project block's start that it alerts, or null for never. Achieve popped the
 * Reminders window as a block started, so the default is 0 — at the start. Only blocks with no
 * explicit `reminder_minutes` use this; an appointment's own reminder always wins.
 */
export const PROJECT_BLOCK_LEADS = [null, 0, 5, 10, 15] as const;
export type ProjectBlockLead = (typeof PROJECT_BLOCK_LEADS)[number];

export type NotificationPrefs = {
  /** Task and project reminders, including ones auto-set from a deadline. */
  tasks: boolean;
  /** Appointments with a reminder, and project blocks. */
  appointments: boolean;
  /** A bill whose expected date arrives with no charge. */
  bills: boolean;
  /** Ready to Assign going negative after an import, sync or alert email. */
  readyToAssign: boolean;
  /** Achieve's "auto-set reminder for projects/tasks with deadlines". */
  autoReminder: boolean;
  /** How many days before the deadline day. 0 is the deadline day itself. */
  autoReminderDays: number;
  /** Minute of the reader's day the auto-reminder is set for. */
  autoReminderMinute: number;
  projectBlockLeadMinutes: ProjectBlockLead;
  /** "Tomorrow" in a snooze, and when bill reminders arrive. */
  morningMinute: number;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  tasks: true,
  appointments: true,
  bills: true,
  readyToAssign: true,
  autoReminder: true,
  autoReminderDays: 1,
  autoReminderMinute: 9 * 60,
  projectBlockLeadMinutes: 0,
  morningMinute: 9 * 60,
};

const LAST_MINUTE = 24 * 60 - 1;

function asMinuteOfDay(value: unknown, fallback: number): number {
  return Math.round(asClampedNumber(value, fallback, 0, LAST_MINUTE));
}

function asProjectBlockLead(value: unknown): ProjectBlockLead {
  // `null` is a stored choice (Off), so it cannot double as "absent" — `undefined` is absent.
  if (value === undefined) return DEFAULT_NOTIFICATION_PREFS.projectBlockLeadMinutes;
  return (PROJECT_BLOCK_LEADS as readonly unknown[]).includes(value)
    ? (value as ProjectBlockLead)
    : DEFAULT_NOTIFICATION_PREFS.projectBlockLeadMinutes;
}

export function parseNotificationPrefs(value: unknown): NotificationPrefs {
  const record = asRecord(value);
  if (!record) return DEFAULT_NOTIFICATION_PREFS;
  const d = DEFAULT_NOTIFICATION_PREFS;
  return {
    tasks: asBoolean(record.tasks, d.tasks),
    appointments: asBoolean(record.appointments, d.appointments),
    bills: asBoolean(record.bills, d.bills),
    readyToAssign: asBoolean(record.readyToAssign, d.readyToAssign),
    autoReminder: asBoolean(record.autoReminder, d.autoReminder),
    autoReminderDays: Math.round(
      asClampedNumber(record.autoReminderDays, d.autoReminderDays, 0, 30),
    ),
    autoReminderMinute: asMinuteOfDay(record.autoReminderMinute, d.autoReminderMinute),
    projectBlockLeadMinutes: asProjectBlockLead(record.projectBlockLeadMinutes),
    morningMinute: asMinuteOfDay(record.morningMinute, d.morningMinute),
  };
}

export function serializeNotificationPrefs(prefs: NotificationPrefs): unknown {
  return { v: SETTINGS_VERSION, ...prefs };
}
