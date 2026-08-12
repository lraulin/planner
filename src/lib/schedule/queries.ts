import { and, asc, eq, gte, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { appointments, timeChartAreas, timeCharts } from "@/db/schema";
import { eventColorHex } from "@/lib/google/eventColors";
import { syncWindowFor } from "@/lib/google/mirror";
import { SYNC_MAX_AGE_MS, syncWindow, type SyncStatus } from "@/lib/google/sync";
import {
  enabledCalendarLinks,
  listCalendarLinks,
  syncIsStale,
} from "@/lib/google/queries";
import {
  appointmentToRecurrenceInput,
  expandRecurrence,
  expandTimeChartAreas,
  type Occurrence,
} from "./recurrence";
import { weekRange, type ScheduleRange } from "./range";

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
  /** First visible day, ISO. Named for the range because the calendar is not always a week. */
  rangeStart: string;
  /** Exclusive end of the visible range, ISO. */
  rangeEnd: string;
  /**
   * The visible day columns as ISO instants (local midnights). Sent with the data rather
   * than recomputed on the client so the grid can only ever draw days this payload covers —
   * a client that derived them from settings would widen the moment you picked Twenty Days,
   * before the twenty days had been loaded.
   */
  days: string[];
  /** Outcome of the Google mirror pass; drives the toolbar banner. */
  sync: SyncStatus;
};

export async function loadSchedule(
  userId: string,
  options: {
    /**
     * Which days are on screen, from `lib/schedule/range.ts`. Defaults to the Sunday-aligned
     * week containing today, which is what every caller wanted before day counts existed.
     */
    range?: ScheduleRange;
    timeChartId?: string | null;
    /** Force a Google pull even if the window is still fresh — the ⟳ Refresh path. */
    forceSync?: boolean;
  } = {},
): Promise<SchedulePayload> {
  const range = options.range ?? weekRange(new Date());
  const { start: rangeStart, end: rangeEnd } = range;

  /**
   * Local-first: paint the mirrored schedule immediately. Stale Google pulls run in the
   * client after paint (`state: "stale"`). Manual force-sync still awaits Google so the
   * Refresh button means what it says. Never let a revoked token 500 the route.
   */
  let sync: SyncStatus = { state: "off" };
  // Wider than the visible range, and independent of the day count — see `syncWindowFor`.
  const window = syncWindowFor(range);
  try {
    if (options.forceSync) {
      sync = await syncWindow(userId, window);
    } else {
      const links = await enabledCalendarLinks(userId);
      if (links.length === 0) {
        sync = { state: "off" };
      } else if (await syncIsStale(userId, SYNC_MAX_AGE_MS)) {
        sync = { state: "stale" };
      } else {
        sync = { state: "skipped" };
      }
    }
  } catch (error) {
    sync = {
      state: "failed",
      message: error instanceof Error ? error.message : "Google Calendar sync failed.",
    };
  }

  // Local reads run together — they never waited on Google once paint is local-first.
  const [charts, appts, calendarLinks] = await Promise.all([
    listTimeCharts(userId),
    listAppointmentsInRange(userId, rangeStart, rangeEnd),
    listCalendarLinks(userId),
  ]);
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
    range.days,
  );

  /**
   * Resolve display colours outside `expandRecurrence`, which stays free of presentation
   * concerns. Calendar colour is the left-edge cue for multi-calendar distinction; event
   * colour (when set) fills the block — see event-colours delta spec.
   */
  const colorByCalendarId = new Map(
    calendarLinks.map((link) => [link.calendarId, link.backgroundColor]),
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
      expandRecurrence(appointmentToRecurrenceInput(a), rangeStart, rangeEnd),
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
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    days: range.days.map((day) => day.toISOString()),
    sync,
  };
}
