import { and, asc, eq, gte, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { appointments, timeChartAreas, timeCharts } from "@/db/schema";
import { eventColorHex } from "@/lib/google/eventColors";
import { syncWindow, syncWindowIfStale, type SyncStatus } from "@/lib/google/sync";
import { listCalendarLinks } from "@/lib/google/queries";
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

/**
 * The Time Charts module's list: every chart plus how many areas it holds.
 *
 * Separate from `listTimeCharts` on purpose — that one feeds the Weekly Schedule's picker
 * and is called on every schedule load, where a count join is waste.
 */
export type TimeChartListRow = {
  id: string;
  name: string;
  description: string;
  updatedAt: Date;
  areaCount: number;
};

export async function listTimeChartSummaries(
  userId: string,
): Promise<TimeChartListRow[]> {
  return db
    .select({
      id: timeCharts.id,
      name: timeCharts.name,
      description: timeCharts.description,
      updatedAt: timeCharts.updatedAt,
      areaCount: sql<number>`count(${timeChartAreas.id})::int`,
    })
    .from(timeCharts)
    .leftJoin(timeChartAreas, eq(timeChartAreas.timeChartId, timeCharts.id))
    .where(eq(timeCharts.userId, userId))
    .groupBy(timeCharts.id)
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

/**
 * An occurrence plus colours for the week grid:
 * - `calendarColor` — source calendar tint (left edge); null for planner-native rows
 * - `eventColor` — resolved Google event palette hex when `colorId` is set; null otherwise
 */
export type ScheduleOccurrence = Occurrence & {
  calendarColor: string | null;
  eventColor: string | null;
};

export type SchedulePayload = {
  charts: Awaited<ReturnType<typeof listTimeCharts>>;
  selectedChartId: string | null;
  areas: Awaited<ReturnType<typeof listTimeChartAreas>>;
  backgroundEvents: ReturnType<typeof expandTimeChartAreas>;
  appointments: Awaited<ReturnType<typeof listAppointmentsInRange>>;
  occurrences: ScheduleOccurrence[];
  weekStart: string; // ISO date key
  /** Outcome of the Google mirror pass for this week; drives the toolbar banner. */
  sync: SyncStatus;
};

export async function loadSchedule(
  userId: string,
  options: {
    weekStart?: Date;
    timeChartId?: string | null;
    weekStartsOn?: number;
    /** Force a Google pull even if the window is still fresh — the ⟳ Refresh path. */
    forceSync?: boolean;
  } = {},
): Promise<SchedulePayload> {
  const weekStartsOn = options.weekStartsOn ?? 0;
  const weekStart = startOfWeek(options.weekStart ?? new Date(), weekStartsOn);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  /**
   * Mirror Google before reading, and never let it take the page down: a revoked token or
   * a Google outage degrades to "the schedule you already had, plus a banner". Throwing
   * here would turn a third-party hiccup into a 500 on the most-used route in the app.
   */
  let sync: SyncStatus = { state: "off" };
  try {
    const window = { start: weekStart, end: weekEnd };
    sync = options.forceSync
      ? await syncWindow(userId, window)
      : await syncWindowIfStale(userId, window);
  } catch (error) {
    sync = {
      state: "failed",
      message: error instanceof Error ? error.message : "Google Calendar sync failed.",
    };
  }

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

  /**
   * Resolve display colours outside `expandRecurrence`, which stays free of presentation
   * concerns. Calendar colour is the left-edge cue for multi-calendar distinction; event
   * colour (when set) fills the block — see event-colours delta spec.
   */
  const colorByCalendarId = new Map(
    (await listCalendarLinks(userId)).map((link) => [
      link.calendarId,
      link.backgroundColor,
    ]),
  );
  const colorsByAppointmentId = new Map(
    appts.map((a) => [
      a.id,
      {
        calendarColor: a.externalCalendarId
          ? (colorByCalendarId.get(a.externalCalendarId) ?? null)
          : null,
        eventColor: eventColorHex(a.colorId),
      },
    ]),
  );

  const occurrences: ScheduleOccurrence[] = appts
    .flatMap((a) =>
      expandRecurrence(appointmentToRecurrenceInput(a), weekStart, weekEnd),
    )
    .map((o) => {
      const colors = colorsByAppointmentId.get(o.id);
      return {
        ...o,
        calendarColor: colors?.calendarColor ?? null,
        eventColor: colors?.eventColor ?? null,
      };
    });

  return {
    charts,
    selectedChartId,
    areas,
    backgroundEvents,
    appointments: appts,
    occurrences,
    weekStart: weekStart.toISOString(),
    sync,
  };
}
