import { and, desc, eq, gte, inArray, isNotNull, lt, ne, or } from "drizzle-orm";
import { db } from "@/db";
import {
  appointments,
  nodes,
  projectDetails,
  pushSubscriptions,
  reminderOccurrences,
  taskDetails,
  users,
  type ReminderSourceKind,
} from "@/db/schema";
import type { DbExecutor } from "@/db/executor";
import { listBudgetStructure, loadBillAnchors } from "@/lib/finances/budget/queries";
import { readSetting } from "@/lib/settings/queries";
import { NOTIFICATIONS_SCOPE } from "@/lib/settings/scopes";
import {
  parseNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/settings/notifications";
import type {
  AppointmentReminderSource,
  BillReminderSource,
  FireWindow,
  NodeReminderSource,
} from "./derive";

/**
 * Reads for reminders: the sources an occurrence can be armed from, and the panel's list.
 * Every function takes `userId` and scopes by it.
 */

export async function loadNotificationPrefs(
  userId: string,
  executor: DbExecutor = db,
): Promise<NotificationPrefs> {
  return parseNotificationPrefs(
    await readSetting(userId, NOTIFICATIONS_SCOPE, executor),
  );
}

/** Which sources to load: these ids, and/or anything that could fire inside the window. */
export type SourceFilter = { ids?: readonly string[]; window?: FireWindow };

function hasFilter(filter: SourceFilter): boolean {
  return (filter.ids?.length ?? 0) > 0 || filter.window !== undefined;
}

export async function loadNodeReminderSources(
  userId: string,
  filter: SourceFilter,
): Promise<NodeReminderSource[]> {
  if (!hasFilter(filter)) return [];
  const { ids, window } = filter;
  const rows = await db
    .select({
      id: nodes.id,
      type: nodes.type,
      name: nodes.name,
      state: nodes.state,
      deadline: nodes.deadline,
      taskReminderAt: taskDetails.reminderAt,
      projectReminderAt: projectDetails.reminderAt,
    })
    .from(nodes)
    .leftJoin(taskDetails, eq(taskDetails.nodeId, nodes.id))
    .leftJoin(projectDetails, eq(projectDetails.nodeId, nodes.id))
    .where(
      and(
        eq(nodes.userId, userId),
        inArray(nodes.type, ["task", "project"]),
        or(
          ids && ids.length > 0 ? inArray(nodes.id, [...ids]) : undefined,
          window
            ? or(
                and(
                  gte(taskDetails.reminderAt, window.from),
                  lt(taskDetails.reminderAt, window.to),
                ),
                and(
                  gte(projectDetails.reminderAt, window.from),
                  lt(projectDetails.reminderAt, window.to),
                ),
              )
            : undefined,
        ),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    kind: row.type === "project" ? "project" : "task",
    name: row.name,
    state: row.state,
    deadline: row.deadline,
    reminderAt:
      (row.type === "project" ? row.projectReminderAt : row.taskReminderAt) ?? null,
  }));
}

/**
 * How far past the window's end a start can be and still fire inside it. Generous on
 * purpose: the window is re-filtered exactly by `appointmentOccurrences`, and this bound
 * only keeps the read from scanning the whole calendar.
 */
const MAX_LEAD_MS = 30 * 24 * 60 * 60_000;

export async function loadAppointmentReminderSources(
  userId: string,
  filter: SourceFilter,
): Promise<AppointmentReminderSource[]> {
  if (!hasFilter(filter)) return [];
  const { ids, window } = filter;
  return db
    .select({
      id: appointments.id,
      subject: appointments.subject,
      location: appointments.location,
      startAt: appointments.startAt,
      endAt: appointments.endAt,
      allDay: appointments.allDay,
      checkState: appointments.checkState,
      projectId: appointments.projectId,
      reminderMinutes: appointments.reminderMinutes,
      recurrenceFrequency: appointments.recurrenceFrequency,
      recurrenceInterval: appointments.recurrenceInterval,
      recurrenceByWeekday: appointments.recurrenceByWeekday,
      recurrenceEnd: appointments.recurrenceEnd,
      recurrenceCount: appointments.recurrenceCount,
      recurrenceUntil: appointments.recurrenceUntil,
      externalSeriesId: appointments.externalSeriesId,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.userId, userId),
        or(
          ids && ids.length > 0 ? inArray(appointments.id, [...ids]) : undefined,
          window
            ? and(
                // Only these can alert at all — see `appointmentLeadMinutes`.
                or(
                  isNotNull(appointments.reminderMinutes),
                  isNotNull(appointments.projectId),
                ),
                or(
                  // A local repeating master can start long before the window.
                  ne(appointments.recurrenceFrequency, "none"),
                  and(
                    gte(appointments.startAt, window.from),
                    lt(
                      appointments.startAt,
                      new Date(window.to.getTime() + MAX_LEAD_MS),
                    ),
                  ),
                ),
              )
            : undefined,
        ),
      ),
    );
}

/**
 * Every bill envelope with the posting it is waiting for, as of `todayKey`. Bills are few,
 * so this reads them all and the caller filters by id.
 */
export async function loadBillReminderSources(
  userId: string,
  todayKey: string,
): Promise<BillReminderSource[]> {
  const { categories } = await listBudgetStructure(userId);
  const bills = categories.filter((category) => category.bill !== null);
  if (bills.length === 0) return [];
  const anchors = await loadBillAnchors(userId, bills, todayKey);
  return bills.map((category) => ({
    id: category.id,
    name: category.name,
    // An unscheduled bill (propane) has a solid cost and no predictable date to alert on.
    active: category.bill?.status === "active" && category.bill.scheduled,
    expectedKey: anchors.get(category.id)?.expectedKey ?? null,
    expectedCents: category.bill?.expectedCents ?? null,
  }));
}

export type OpenOccurrence = {
  id: string;
  sourceKind: ReminderSourceKind;
  sourceId: string;
  occurrenceKey: string;
  scheduledFor: Date;
  state: "scheduled" | "fired";
};

/** Rows still waiting or still in the panel, optionally only for some sources. */
export async function listOpenOccurrences(
  userId: string,
  sourceIds?: readonly string[],
): Promise<OpenOccurrence[]> {
  const rows = await db
    .select({
      id: reminderOccurrences.id,
      sourceKind: reminderOccurrences.sourceKind,
      sourceId: reminderOccurrences.sourceId,
      occurrenceKey: reminderOccurrences.occurrenceKey,
      scheduledFor: reminderOccurrences.scheduledFor,
      state: reminderOccurrences.state,
    })
    .from(reminderOccurrences)
    .where(
      and(
        eq(reminderOccurrences.userId, userId),
        inArray(reminderOccurrences.state, ["scheduled", "fired"]),
        sourceIds ? inArray(reminderOccurrences.sourceId, [...sourceIds]) : undefined,
      ),
    );
  return rows as OpenOccurrence[];
}

// ---------------------------------------------------------------------------------------
// The Reminders panel

export type FiredReminder = {
  id: string;
  sourceKind: ReminderSourceKind;
  sourceId: string;
  title: string;
  detail: string;
  dueAt: Date;
  firedAt: Date | null;
  /** For a project block: the project, so the panel can offer View tasks. */
  blockProjectId: string | null;
};

/** Enough for a panel; anything older has long since stopped being a reminder. */
const PANEL_LIMIT = 100;

/**
 * Everything that has fired and not been acted on, newest first — Achieve's Reminders window.
 * One query: the project-block link comes from a join rather than a second read.
 */
export async function listFiredReminders(userId: string): Promise<FiredReminder[]> {
  return db
    .select({
      id: reminderOccurrences.id,
      sourceKind: reminderOccurrences.sourceKind,
      sourceId: reminderOccurrences.sourceId,
      title: reminderOccurrences.title,
      detail: reminderOccurrences.detail,
      dueAt: reminderOccurrences.dueAt,
      firedAt: reminderOccurrences.firedAt,
      blockProjectId: appointments.projectId,
    })
    .from(reminderOccurrences)
    .leftJoin(
      appointments,
      and(
        eq(reminderOccurrences.sourceKind, "appointment"),
        eq(appointments.id, reminderOccurrences.sourceId),
        eq(appointments.userId, reminderOccurrences.userId),
      ),
    )
    .where(
      and(
        eq(reminderOccurrences.userId, userId),
        eq(reminderOccurrences.state, "fired"),
      ),
    )
    .orderBy(desc(reminderOccurrences.firedAt), desc(reminderOccurrences.dueAt))
    .limit(PANEL_LIMIT);
}

// ---------------------------------------------------------------------------------------
// Devices

export type PushDevice = {
  id: string;
  label: string;
  endpoint: string;
  createdAt: Date;
  lastSuccessAt: Date | null;
};

export async function listPushDevices(userId: string): Promise<PushDevice[]> {
  return db
    .select({
      id: pushSubscriptions.id,
      label: pushSubscriptions.label,
      endpoint: pushSubscriptions.endpoint,
      createdAt: pushSubscriptions.createdAt,
      lastSuccessAt: pushSubscriptions.lastSuccessAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(desc(pushSubscriptions.createdAt));
}

/**
 * Users the daily sweep visits. Every account, because there is no cheaper test for "could
 * have something to be reminded of" than arming — and there are a handful of accounts.
 */
export async function listSweepUserIds(): Promise<string[]> {
  const rows = await db.select({ id: users.id }).from(users);
  return rows.map((row) => row.id);
}
