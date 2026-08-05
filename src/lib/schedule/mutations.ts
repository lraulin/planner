import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  appointments,
  timeChartAreas,
  timeCharts,
  type Appointment,
  type AppointmentCheck,
  type NewAppointment,
  type PriorityLetter,
  type RecurrenceEnd,
  type RecurrenceFrequency,
  type ShowAs,
} from "@/db/schema";
import { syncWindow } from "@/lib/google/sync";
import {
  pushCreate,
  pushDelete,
  pushUpdate,
  type PushableAppointment,
} from "@/lib/google/writeThrough";
import { sortDays, startOfWeek } from "./geometry";

/** The week containing `at`, the unit `loadSchedule` mirrors. */
function weekWindowAround(at: Date) {
  const start = startOfWeek(at, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

/**
 * The Google-owned view of a row, for building a write body. Merges a patch over the
 * stored row so a partial update still sends a complete, consistent event.
 */
function pushableFrom(
  row: Appointment,
  patch: Record<string, unknown> = {},
): PushableAppointment {
  const merged = { ...row, ...patch };
  return {
    subject: merged.subject,
    location: merged.location,
    notes: merged.notes,
    startAt: merged.startAt,
    endAt: merged.endAt,
    allDay: merged.allDay,
    showAs: merged.showAs,
    recurrenceFrequency: merged.recurrenceFrequency,
    recurrenceInterval: merged.recurrenceInterval,
    recurrenceByWeekday: merged.recurrenceByWeekday,
    recurrenceEnd: merged.recurrenceEnd,
    recurrenceCount: merged.recurrenceCount,
    recurrenceUntil: merged.recurrenceUntil,
  };
}

export async function createTimeChart(userId: string, name: string) {
  const [row] = await db
    .insert(timeCharts)
    .values({ userId, name: name.trim() || "New Time Chart" })
    .returning();
  return row;
}

export type TimeChartInput = {
  name?: string;
  description?: string;
};

/**
 * Achieve's Time Chart Information form, General tab. An omitted key is left alone, so the
 * list can rename in place without clearing a description it never loaded.
 */
export async function updateTimeChart(
  userId: string,
  id: string,
  input: TimeChartInput,
) {
  const values: Partial<typeof timeCharts.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = input.name.trim() || "Untitled";
  if (input.description !== undefined) values.description = input.description.trim();

  const [row] = await db
    .update(timeCharts)
    .set(values)
    .where(and(eq(timeCharts.id, id), eq(timeCharts.userId, userId)))
    .returning();
  if (!row) throw new Error("Time Chart not found.");
  return row;
}

export async function renameTimeChart(userId: string, id: string, name: string) {
  return updateTimeChart(userId, id, { name });
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
  checkState?: AppointmentCheck;
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

/**
 * Returns the created row, or **null** when a recurring appointment was posted to Google
 * but its instances have not been mirrored back yet. The null is explicit in the signature
 * on purpose: array destructuring below would otherwise type the lookup as non-null and
 * hide the case from every caller.
 */
export async function createAppointment(
  userId: string,
  input: AppointmentInput,
): Promise<Appointment | null> {
  assertRange(input.startAt, input.endAt);
  const values: NewAppointment = {
    userId,
    subject: input.subject.trim() || "Appointment",
    location: input.location ?? "",
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay ?? false,
    checkState: input.checkState ?? "open",
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

  // Write through to Google before storing anything, so a rejected event never leaves a
  // local row claiming to exist on a calendar it does not. A no-op when Google is not set
  // up, which is what keeps the planner usable as a purely local calendar.
  const pushed = await pushCreate(userId, values as PushableAppointment);

  if (pushed.pushed && pushed.recurring) {
    // The series lives in Google and only its instances live here. Pull the window around
    // the start so the first occurrences arrive as ordinary rows, then hand back the one
    // the user just created.
    const window = weekWindowAround(values.startAt);
    await syncWindow(userId, window);
    const [instance] = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.userId, userId),
          eq(appointments.externalSeriesId, pushed.seriesId),
        ),
      )
      .orderBy(asc(appointments.startAt))
      .limit(1);
    // The series exists in Google either way; a mirror that could not run yet just means
    // the rows appear on the next refresh.
    return instance ?? null;
  }

  const [row] = await db
    .insert(appointments)
    .values(pushed.pushed ? { ...values, ...pushed.stamp } : values)
    .returning();
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
  if (input.subject !== undefined)
    patch.subject = input.subject.trim() || "Appointment";
  if (input.location !== undefined) patch.location = input.location;
  if (input.allDay !== undefined) patch.allDay = input.allDay;
  if (input.checkState !== undefined) patch.checkState = input.checkState;
  if (input.reminderMinutes !== undefined)
    patch.reminderMinutes = input.reminderMinutes;
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
  if (input.recurrenceCount !== undefined)
    patch.recurrenceCount = input.recurrenceCount;
  if (input.recurrenceUntil !== undefined)
    patch.recurrenceUntil = input.recurrenceUntil;

  // Push before writing locally: if Google rejects the change, the mutation throws and the
  // stored row still matches what Google holds.
  const stamp = await pushUpdate(userId, existing, pushableFrom(existing, patch));
  if (stamp) Object.assign(patch, stamp);

  const [row] = await db
    .update(appointments)
    .set(patch)
    .where(and(eq(appointments.id, id), eq(appointments.userId, userId)))
    .returning();
  return row;
}

export async function deleteAppointment(userId: string, id: string) {
  const [existing] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.userId, userId)))
    .limit(1);
  if (!existing) throw new Error("Appointment not found.");

  // Google first. A failure here leaves the row in place, which is recoverable; deleting
  // locally first would strand an event in Google with nothing left here naming it.
  await pushDelete(userId, existing);

  const deleted = await db
    .delete(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.userId, userId)))
    .returning({ id: appointments.id });
  if (deleted.length === 0) throw new Error("Appointment not found.");
}

/**
 * Purely local — the three-state check is a planner annotation Google has no field for, so
 * ticking one off never touches the network. See the field-ownership table in the spec.
 */
export async function setAppointmentCheckState(
  userId: string,
  id: string,
  checkState: AppointmentCheck,
) {
  const [row] = await db
    .update(appointments)
    .set({ checkState, updatedAt: new Date() })
    .where(and(eq(appointments.id, id), eq(appointments.userId, userId)))
    .returning();
  if (!row) throw new Error("Appointment not found.");
  return row;
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

  const [existing] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.userId, userId)))
    .limit(1);
  if (!existing) throw new Error("Appointment not found.");

  // Dragging a Google event in the week grid moves it in Google. For an instance of a
  // series this moves that occurrence only, which is what Google's own UI does too.
  const stamp = await pushUpdate(userId, existing, pushableFrom(existing, patch));
  if (stamp) Object.assign(patch, stamp);

  const [row] = await db
    .update(appointments)
    .set(patch)
    .where(and(eq(appointments.id, id), eq(appointments.userId, userId)))
    .returning();
  if (!row) throw new Error("Appointment not found.");
  return row;
}
