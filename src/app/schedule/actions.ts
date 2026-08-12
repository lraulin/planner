"use server";

import type {
  AppointmentCheck,
  PriorityLetter,
  RecurrenceEnd,
  RecurrenceFrequency,
  ShowAs,
} from "@/db/schema";
import * as schedule from "@/lib/schedule/mutations";
import type {
  AppointmentInput,
  TimeChartAreaInput,
  TimeChartInput,
} from "@/lib/schedule/mutations";
import { fromDateKey } from "@/lib/schedule/geometry";
import { loadScheduleView, rangeForView } from "@/lib/schedule/viewRange";
import { syncWindowFor } from "@/lib/google/mirror";
import { syncWindow } from "@/lib/google/sync";
import { run, type ActionResult } from "../actionResult";

// ── Time charts ──────────────────────────────────────────────────────────────

export async function createTimeChartAction(name: string): Promise<ActionResult> {
  return run((userId) => schedule.createTimeChart(userId, name));
}

export async function renameTimeChartAction(
  id: string,
  name: string,
): Promise<ActionResult> {
  return run((userId) => schedule.renameTimeChart(userId, id, name));
}

export async function updateTimeChartAction(
  id: string,
  input: TimeChartInput,
): Promise<ActionResult> {
  return run((userId) => schedule.updateTimeChart(userId, id, input));
}

export async function deleteTimeChartAction(id: string): Promise<ActionResult> {
  return run((userId) => schedule.deleteTimeChart(userId, id));
}

export async function createTimeChartAreaAction(
  timeChartId: string,
  input: TimeChartAreaInput,
): Promise<ActionResult> {
  return run((userId) => schedule.createTimeChartArea(userId, timeChartId, input));
}

export async function updateTimeChartAreaAction(
  id: string,
  input: Partial<TimeChartAreaInput>,
): Promise<ActionResult> {
  return run((userId) => schedule.updateTimeChartArea(userId, id, input));
}

export async function deleteTimeChartAreaAction(id: string): Promise<ActionResult> {
  return run((userId) => schedule.deleteTimeChartArea(userId, id));
}

// ── Appointments ─────────────────────────────────────────────────────────────

export type AppointmentFormPayload = {
  subject: string;
  location?: string;
  startAt: string; // ISO
  endAt: string;
  allDay?: boolean;
  checkState?: AppointmentCheck;
  reminderMinutes?: number | null;
  showAs?: ShowAs;
  /** Google event colour id `"1"`–`"11"`, or null for calendar default. */
  colorId?: string | null;
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
  recurrenceUntil?: string | null;
};

function toInput(payload: AppointmentFormPayload): AppointmentInput {
  return {
    ...payload,
    startAt: new Date(payload.startAt),
    endAt: new Date(payload.endAt),
    recurrenceUntil: payload.recurrenceUntil
      ? new Date(payload.recurrenceUntil)
      : payload.recurrenceUntil === null
        ? null
        : undefined,
  };
}

export async function createAppointmentAction(
  payload: AppointmentFormPayload,
): Promise<ActionResult> {
  return run((userId) => schedule.createAppointment(userId, toInput(payload)));
}

export async function updateAppointmentAction(
  id: string,
  payload: Partial<AppointmentFormPayload>,
): Promise<ActionResult> {
  return run(async (userId) => {
    const input: Partial<AppointmentInput> = {
      ...payload,
    } as Partial<AppointmentInput>;
    if (payload.startAt) input.startAt = new Date(payload.startAt);
    if (payload.endAt) input.endAt = new Date(payload.endAt);
    if (payload.recurrenceUntil !== undefined) {
      input.recurrenceUntil = payload.recurrenceUntil
        ? new Date(payload.recurrenceUntil)
        : null;
    }
    return schedule.updateAppointment(userId, id, input);
  });
}

export async function deleteAppointmentAction(id: string): Promise<ActionResult> {
  return run((userId) => schedule.deleteAppointment(userId, id));
}

export async function setAppointmentCheckStateAction(
  id: string,
  checkState: AppointmentCheck,
): Promise<ActionResult> {
  return run((userId) => schedule.setAppointmentCheckState(userId, id, checkState));
}

export async function rescheduleAppointmentAction(
  id: string,
  startAt: string,
  endAt: string,
  clearRecurrence = false,
): Promise<ActionResult> {
  return run((userId) =>
    schedule.rescheduleAppointment(userId, id, new Date(startAt), new Date(endAt), {
      clearRecurrence,
    }),
  );
}

export async function duplicateAppointmentAction(
  id: string,
  startAt: string,
  endAt: string,
): Promise<ActionResult> {
  return run(async (userId) => {
    const { getAppointment } = await import("@/lib/schedule/queries");
    const existing = await getAppointment(userId, id);
    if (!existing) throw new Error("Appointment not found.");
    return schedule.createAppointment(userId, {
      subject: existing.subject,
      location: existing.location,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      allDay: existing.allDay,
      checkState: "open",
      reminderMinutes: existing.reminderMinutes,
      showAs: existing.showAs,
      priorityLetter: existing.priorityLetter,
      priorityRank: existing.priorityRank,
      projectId: existing.projectId,
      notes: existing.notes,
      contexts: existing.contexts,
      private: existing.private,
      recurrenceFrequency: "none",
    });
  });
}

// ── Google Calendar ──────────────────────────────────────────────────────────

/**
 * Force a mirror pass over the window behind the range on screen, bypassing the staleness
 * throttle. This is the ⟳ Refresh button; the automatic pull happens inside `loadSchedule`.
 *
 * Takes the anchor day and rebuilds the range from stored settings rather than trusting a
 * window from the client — the automatic pull derives it the same way, and a Refresh that
 * fetched a different window than the page loads would leave "refreshed" days empty.
 */
export async function syncGoogleAction(anchorKey: string): Promise<ActionResult> {
  // No layout revalidate: the client calls `router.refresh()` once on success so a
  // background stale-sync does not thrash the page while the user is editing.
  return run(
    async (userId) => {
      const range = rangeForView(fromDateKey(anchorKey), await loadScheduleView());
      const status = await syncWindow(userId, syncWindowFor(range));
      // The mirror reports failure rather than throwing, so surface it as an action error —
      // otherwise a refresh that reached nothing would look like it succeeded.
      if (status.state === "failed" || status.state === "not_linked") {
        throw new Error(status.message);
      }
    },
    { revalidate: [] },
  );
}
