import { and, asc, eq, gte, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { appointments, timeChartAreas, timeCharts } from "@/db/schema";
import {
  appointmentToRecurrenceInput,
  expandRecurrence,
  expandTimeChartAreas,
  type Occurrence,
} from "./recurrence";
import { startOfWeek } from "./geometry";

export async function listTimeCharts(userId: string) {
  return db
    .select()
    .from(timeCharts)
    .where(eq(timeCharts.userId, userId))
    .orderBy(asc(timeCharts.name));
}

export async function getTimeChart(userId: string, id: string) {
  const [chart] = await db
    .select()
    .from(timeCharts)
    .where(and(eq(timeCharts.id, id), eq(timeCharts.userId, userId)))
    .limit(1);
  return chart ?? null;
}

export async function listTimeChartAreas(userId: string, timeChartId: string) {
  return db
    .select()
    .from(timeChartAreas)
    .where(
      and(
        eq(timeChartAreas.userId, userId),
        eq(timeChartAreas.timeChartId, timeChartId),
      ),
    )
    .orderBy(asc(timeChartAreas.startMinute));
}

/**
 * Appointments that might produce occurrences in [rangeStart, rangeEnd).
 * Includes recurring masters that started before the range.
 */
export async function listAppointmentsInRange(
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
) {
  return db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.userId, userId),
        or(
          // Non-recurring overlapping the window
          and(
            eq(appointments.recurrenceFrequency, "none"),
            lt(appointments.startAt, rangeEnd),
            gte(appointments.endAt, rangeStart),
          ),
          // Recurring masters that began before the range ends
          and(
            sql`${appointments.recurrenceFrequency} <> 'none'`,
            lt(appointments.startAt, rangeEnd),
          ),
        ),
      ),
    )
    .orderBy(asc(appointments.startAt));
}

export async function getAppointment(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.userId, userId)))
    .limit(1);
  return row ?? null;
}

export type SchedulePayload = {
  charts: Awaited<ReturnType<typeof listTimeCharts>>;
  selectedChartId: string | null;
  areas: Awaited<ReturnType<typeof listTimeChartAreas>>;
  backgroundEvents: ReturnType<typeof expandTimeChartAreas>;
  appointments: Awaited<ReturnType<typeof listAppointmentsInRange>>;
  occurrences: Occurrence[];
  weekStart: string; // ISO date key
};

export async function loadSchedule(
  userId: string,
  options: {
    weekStart?: Date;
    timeChartId?: string | null;
    weekStartsOn?: number;
  } = {},
): Promise<SchedulePayload> {
  const weekStartsOn = options.weekStartsOn ?? 0;
  const weekStart = startOfWeek(options.weekStart ?? new Date(), weekStartsOn);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const charts = await listTimeCharts(userId);
  let selectedChartId = options.timeChartId ?? charts[0]?.id ?? null;
  if (selectedChartId && !charts.some((c) => c.id === selectedChartId)) {
    selectedChartId = charts[0]?.id ?? null;
  }

  const areas = selectedChartId
    ? await listTimeChartAreas(userId, selectedChartId)
    : [];

  const backgroundEvents = expandTimeChartAreas(
    areas.map((a) => ({
      id: a.id,
      name: a.name,
      daysOfWeek: a.daysOfWeek,
      startMinute: a.startMinute,
      durationMinutes: a.durationMinutes,
      backColor: a.backColor,
      foreColor: a.foreColor,
      labelEnabled: a.labelEnabled,
    })),
    weekStart,
  );

  const appts = await listAppointmentsInRange(userId, weekStart, weekEnd);
  const occurrences = appts.flatMap((a) =>
    expandRecurrence(appointmentToRecurrenceInput(a), weekStart, weekEnd),
  );

  return {
    charts,
    selectedChartId,
    areas,
    backgroundEvents,
    appointments: appts,
    occurrences,
    weekStart: weekStart.toISOString(),
  };
}
