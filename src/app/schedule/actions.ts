"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import type {
  PriorityLetter,
  RecurrenceEnd,
  RecurrenceFrequency,
  ShowAs,
} from "@/db/schema";
import * as schedule from "@/lib/schedule/mutations";
import type { AppointmentInput, TimeChartAreaInput } from "@/lib/schedule/mutations";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

async function run<T>(work: (userId: string) => Promise<T>): Promise<ActionResult> {
  try {
    const userId = await getCurrentUserId();
    const result = await work(userId);
    revalidatePath("/", "layout");
    return typeof result === "string"
      ? { ok: true, id: result }
      : result && typeof result === "object" && "id" in result
        ? { ok: true, id: (result as { id: string }).id }
        : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

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
    const input: Partial<AppointmentInput> = { ...payload } as Partial<AppointmentInput>;
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
      completed: false,
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
