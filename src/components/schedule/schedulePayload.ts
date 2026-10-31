import type { ActionResult } from "@/app/actionResult";
import {
  duplicateAppointmentAction,
  rescheduleAppointmentAction,
} from "@/app/(shell)/schedule/actions";
import { parseFloatingDateTime } from "@/lib/schedule/geometry";
import type { SchedulePayload } from "@/lib/schedule/queries";

/**
 * Revive the Date fields a schedule payload loses crossing from server to client: the Time
 * Chart's background blocks, the occurrences on the grid, and the appointments behind them.
 */
export function hydrateSchedule(payload: SchedulePayload) {
  return {
    charts: payload.charts,
    selectedChartId: payload.selectedChartId,
    backgroundEvents: payload.backgroundEvents.map((e) => ({
      ...e,
      start: parseFloatingDateTime(e.start),
      end: parseFloatingDateTime(e.end),
    })),
    occurrences: payload.occurrences.map((o) => ({
      ...o,
      startAt: new Date(o.startAt),
      endAt: new Date(o.endAt),
    })),
    masters: payload.appointments.map((a) => ({
      ...a,
      startAt: new Date(a.startAt),
      endAt: new Date(a.endAt),
      recurrenceUntil: a.recurrenceUntil ? new Date(a.recurrenceUntil) : null,
      createdAt: new Date(a.createdAt),
      updatedAt: new Date(a.updatedAt),
    })),
  };
}

/**
 * An appointment dropped somewhere on the week grid: moved there, or — with the duplicate
 * modifier held — copied there, leaving the original where it was.
 */
export function dropAppointment(
  id: string,
  start: Date,
  end: Date,
  opts: { duplicate: boolean },
): Promise<ActionResult> {
  if (opts.duplicate) {
    return duplicateAppointmentAction(id, start.toISOString(), end.toISOString());
  }
  return rescheduleAppointmentAction(id, start.toISOString(), end.toISOString(), true);
}
