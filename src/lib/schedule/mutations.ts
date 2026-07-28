import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  appointments,
  timeChartAreas,
  timeCharts,
  type NewAppointment,
  type PriorityLetter,
  type RecurrenceEnd,
  type RecurrenceFrequency,
  type ShowAs,
} from "@/db/schema";
import { sortDays } from "./geometry";

export async function createTimeChart(userId: string, name: string) {
  const [row] = await db
    .insert(timeCharts)
    .values({ userId, name: name.trim() || "New Time Chart" })
    .returning();
  return row;
}

export async function renameTimeChart(userId: string, id: string, name: string) {
  const [row] = await db
    .update(timeCharts)
    .set({ name: name.trim() || "Untitled", updatedAt: new Date() })
    .where(and(eq(timeCharts.id, id), eq(timeCharts.userId, userId)))
    .returning();
  if (!row) throw new Error("Time Chart not found.");
  return row;
}

export async function deleteTimeChart(userId: string, id: string) {
  const deleted = await db
    .delete(timeCharts)
    .where(and(eq(timeCharts.id, id), eq(timeCharts.userId, userId)))
    .returning({ id: timeCharts.id });
  if (deleted.length === 0) throw new Error("Time Chart not found.");
}

export type TimeChartAreaInput = {
  name: string;
  resultAreaId?: string | null;
  daysOfWeek: number[];
  startMinute: number;
  durationMinutes: number;
  labelEnabled?: boolean;
  foreColor?: string;
  backColor?: string;
  description?: string;
};

export async function createTimeChartArea(
  userId: string,
  timeChartId: string,
  input: TimeChartAreaInput,
) {
  const [chart] = await db
    .select({ id: timeCharts.id })
    .from(timeCharts)
    .where(and(eq(timeCharts.id, timeChartId), eq(timeCharts.userId, userId)))
    .limit(1);
  if (!chart) throw new Error("Time Chart not found.");

  const [row] = await db
    .insert(timeChartAreas)
    .values({
      userId,
      timeChartId,
      name: input.name.trim(),
      resultAreaId: input.resultAreaId ?? null,
      daysOfWeek: sortDays(input.daysOfWeek),
      startMinute: input.startMinute,
      durationMinutes: Math.max(1, input.durationMinutes),
      labelEnabled: input.labelEnabled ?? true,
      foreColor: input.foreColor ?? "#1b1d23",
      backColor: input.backColor ?? "#c8e0f0",
      description: input.description ?? "",
    })
    .returning();
  return row;
}

export async function updateTimeChartArea(
  userId: string,
  id: string,
  input: Partial<TimeChartAreaInput>,
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.resultAreaId !== undefined) patch.resultAreaId = input.resultAreaId;
  if (input.daysOfWeek !== undefined) patch.daysOfWeek = sortDays(input.daysOfWeek);
  if (input.startMinute !== undefined) patch.startMinute = input.startMinute;
  if (input.durationMinutes !== undefined) {
    patch.durationMinutes = Math.max(1, input.durationMinutes);
  }
  if (input.labelEnabled !== undefined) patch.labelEnabled = input.labelEnabled;
  if (input.foreColor !== undefined) patch.foreColor = input.foreColor;
  if (input.backColor !== undefined) patch.backColor = input.backColor;
  if (input.description !== undefined) patch.description = input.description;

  const [row] = await db
    .update(timeChartAreas)
    .set(patch)
    .where(and(eq(timeChartAreas.id, id), eq(timeChartAreas.userId, userId)))
    .returning();
  if (!row) throw new Error("Time Chart area not found.");
  return row;
}

export async function deleteTimeChartArea(userId: string, id: string) {
  const deleted = await db
    .delete(timeChartAreas)
    .where(and(eq(timeChartAreas.id, id), eq(timeChartAreas.userId, userId)))
    .returning({ id: timeChartAreas.id });
  if (deleted.length === 0) throw new Error("Time Chart area not found.");
}

export type AppointmentInput = {
  subject: string;
  location?: string;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  completed?: boolean;
  reminderMinutes?: number | null;
  showAs?: ShowAs;
  priorityLetter?: PriorityLetter | null;
  priorityRank?: number | null;
  projectId?: string | null;
  notes?: string;
  contexts?: string[];
  private?: boolean;
  recurrenceFrequency?: RecurrenceFrequency;
  recurrenceInterval?: number;
  recurrenceByWeekday?: number[] | null;
  recurrenceEnd?: RecurrenceEnd;
  recurrenceCount?: number | null;
  recurrenceUntil?: Date | null;
};

function assertRange(startAt: Date, endAt: Date) {
  if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime())) {
    throw new Error("Start time is invalid.");
  }
  if (!(endAt instanceof Date) || Number.isNaN(endAt.getTime())) {
    throw new Error("End time is invalid.");
  }
  if (endAt <= startAt) {
    throw new Error("End time must be after start time.");
  }
}

export async function createAppointment(userId: string, input: AppointmentInput) {
  assertRange(input.startAt, input.endAt);
  const values: NewAppointment = {
    userId,
    subject: input.subject.trim() || "Appointment",
    location: input.location ?? "",
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay ?? false,
    completed: input.completed ?? false,
    reminderMinutes: input.reminderMinutes ?? null,
    showAs: input.showAs ?? "busy",
    priorityLetter: input.priorityLetter ?? null,
    priorityRank: input.priorityRank ?? null,
    projectId: input.projectId ?? null,
    notes: input.notes ?? "",
    contexts: input.contexts ?? [],
    private: input.private ?? false,
    recurrenceFrequency: input.recurrenceFrequency ?? "none",
    recurrenceInterval: Math.max(1, input.recurrenceInterval ?? 1),
    recurrenceByWeekday: input.recurrenceByWeekday
      ? sortDays(input.recurrenceByWeekday)
      : null,
    recurrenceEnd: input.recurrenceEnd ?? "never",
    recurrenceCount: input.recurrenceCount ?? null,
    recurrenceUntil: input.recurrenceUntil ?? null,
  };

  const [row] = await db.insert(appointments).values(values).returning();
  return row;
}

export async function updateAppointment(
  userId: string,
  id: string,
  input: Partial<AppointmentInput>,
) {
  const [existing] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.userId, userId)))
    .limit(1);
  if (!existing) throw new Error("Appointment not found.");

  const startAt = input.startAt ?? existing.startAt;
  const endAt = input.endAt ?? existing.endAt;
  assertRange(startAt, endAt);

  const patch: Record<string, unknown> = {
    updatedAt: new Date(),
    startAt,
    endAt,
  };
  if (input.subject !== undefined) patch.subject = input.subject.trim() || "Appointment";
  if (input.location !== undefined) patch.location = input.location;
  if (input.allDay !== undefined) patch.allDay = input.allDay;
  if (input.completed !== undefined) patch.completed = input.completed;
  if (input.reminderMinutes !== undefined) patch.reminderMinutes = input.reminderMinutes;
  if (input.showAs !== undefined) patch.showAs = input.showAs;
  if (input.priorityLetter !== undefined) patch.priorityLetter = input.priorityLetter;
  if (input.priorityRank !== undefined) patch.priorityRank = input.priorityRank;
  if (input.projectId !== undefined) patch.projectId = input.projectId;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.contexts !== undefined) patch.contexts = input.contexts;
  if (input.private !== undefined) patch.private = input.private;
  if (input.recurrenceFrequency !== undefined) {
    patch.recurrenceFrequency = input.recurrenceFrequency;
  }
  if (input.recurrenceInterval !== undefined) {
    patch.recurrenceInterval = Math.max(1, input.recurrenceInterval);
  }
  if (input.recurrenceByWeekday !== undefined) {
    patch.recurrenceByWeekday = input.recurrenceByWeekday
      ? sortDays(input.recurrenceByWeekday)
      : null;
  }
  if (input.recurrenceEnd !== undefined) patch.recurrenceEnd = input.recurrenceEnd;
  if (input.recurrenceCount !== undefined) patch.recurrenceCount = input.recurrenceCount;
  if (input.recurrenceUntil !== undefined) patch.recurrenceUntil = input.recurrenceUntil;

  const [row] = await db
    .update(appointments)
    .set(patch)
    .where(and(eq(appointments.id, id), eq(appointments.userId, userId)))
    .returning();
  return row;
}

export async function deleteAppointment(userId: string, id: string) {
  const deleted = await db
    .delete(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.userId, userId)))
    .returning({ id: appointments.id });
  if (deleted.length === 0) throw new Error("Appointment not found.");
}

/** Move/resize: update only the timed range (and clear recurrence for simplicity). */
export async function rescheduleAppointment(
  userId: string,
  id: string,
  startAt: Date,
  endAt: Date,
  options?: { clearRecurrence?: boolean },
) {
  assertRange(startAt, endAt);
  const patch: Record<string, unknown> = {
    startAt,
    endAt,
    updatedAt: new Date(),
  };
  if (options?.clearRecurrence) {
    patch.recurrenceFrequency = "none";
    patch.recurrenceEnd = "never";
    patch.recurrenceCount = null;
    patch.recurrenceUntil = null;
    patch.recurrenceByWeekday = null;
  }
  const [row] = await db
    .update(appointments)
    .set(patch)
    .where(and(eq(appointments.id, id), eq(appointments.userId, userId)))
    .returning();
  if (!row) throw new Error("Appointment not found.");
  return row;
}
