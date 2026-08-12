/**
 * Agent tools over the weekly schedule: read a week, create / update / delete appointments.
 */

import {
  createAppointment,
  deleteAppointment,
  updateAppointment,
  type AppointmentInput,
} from "@/lib/schedule/mutations";
import { getWeeklyPlan } from "@/lib/planning/queries";
import { loadSchedule } from "@/lib/schedule/queries";
import { startOfWeek, toDateKey } from "@/lib/schedule/geometry";
import { weekRange } from "@/lib/schedule/range";
import { AgentError } from "./errors";
import {
  optionalBoolean,
  optionalNullableString,
  optionalNumber,
  optionalString,
  optionalStringArray,
  parseDate,
  requireString,
} from "./parse";
import { iso } from "./serialize";

export async function getWeekTool(userId: string, args: Record<string, unknown>) {
  const weekStartsOn = optionalNumber(args, "weekStartsOn") ?? 0;
  const weekStartArg = optionalString(args, "weekStart");
  const weekStart = startOfWeek(
    weekStartArg ? (parseDate(weekStartArg, "weekStart") ?? new Date()) : new Date(),
    weekStartsOn,
  );
  const schedule = await loadSchedule(userId, {
    range: weekRange(weekStart, weekStartsOn),
  });
  const plan = await getWeeklyPlan(userId, weekStart, weekStartsOn);

  return {
    weekStart: toDateKey(weekStart),
    weekStartsOn,
    plan: plan
      ? {
          id: plan.id,
          completedAt: iso(plan.completedAt),
          availableMinutes: plan.availableMinutes,
          timeChartId: plan.timeChartId,
          blockSizeMinutes: plan.blockSizeMinutes,
          avoidCollisions: plan.avoidCollisions,
        }
      : null,
    appointments: schedule.appointments.map((a) => ({
      id: a.id,
      subject: a.subject,
      startAt: a.startAt.toISOString(),
      endAt: a.endAt.toISOString(),
      allDay: a.allDay,
      checkState: a.checkState,
      projectId: a.projectId,
      location: a.location,
    })),
    occurrences: schedule.occurrences.map((o) => ({
      id: o.id,
      occurrenceKey: o.occurrenceKey,
      subject: o.subject,
      startAt: o.startAt.toISOString(),
      endAt: o.endAt.toISOString(),
      projectId: o.projectId,
      checkState: o.checkState,
    })),
  };
}

export async function createAppointmentTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const subject = optionalString(args, "subject") ?? "Appointment";
  const startAt = parseDate(requireString(args, "startAt"), "startAt");
  const endAt = parseDate(requireString(args, "endAt"), "endAt");
  if (!startAt || !endAt) {
    throw new AgentError("validation", "startAt and endAt are required ISO dates");
  }

  const input: AppointmentInput = {
    subject,
    startAt,
    endAt,
    location: optionalString(args, "location"),
    allDay: optionalBoolean(args, "allDay"),
    projectId: optionalNullableString(args, "projectId") ?? undefined,
    notes: optionalString(args, "notes"),
    contexts: optionalStringArray(args, "contexts"),
  };

  const row = await createAppointment(userId, input);
  // Null only happens for a recurring create whose instances have not mirrored back yet,
  // and this tool takes no recurrence arguments — so reaching here means something changed
  // upstream and the caller should hear about it rather than get a half-built payload.
  if (!row) {
    throw new AgentError(
      "internal",
      "Appointment was created but could not be read back",
    );
  }
  return {
    appointment: {
      id: row.id,
      subject: row.subject,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      projectId: row.projectId,
      checkState: row.checkState,
    },
  };
}

export async function updateAppointmentTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const id = requireString(args, "id");
  const patch: Partial<AppointmentInput> = {};
  if (args.subject !== undefined) patch.subject = requireString(args, "subject");
  if (args.startAt !== undefined) {
    patch.startAt = parseDate(requireString(args, "startAt"), "startAt") ?? undefined;
  }
  if (args.endAt !== undefined) {
    patch.endAt = parseDate(requireString(args, "endAt"), "endAt") ?? undefined;
  }
  if (args.location !== undefined) patch.location = optionalString(args, "location");
  if (args.allDay !== undefined) patch.allDay = optionalBoolean(args, "allDay");
  if (args.projectId !== undefined) {
    patch.projectId = optionalNullableString(args, "projectId") ?? null;
  }
  if (args.notes !== undefined) patch.notes = optionalString(args, "notes");
  if (args.checkState !== undefined) {
    const cs = requireString(args, "checkState");
    if (cs !== "open" && cs !== "done" && cs !== "missed") {
      throw new AgentError("validation", "checkState must be open, done, or missed");
    }
    patch.checkState = cs;
  }

  const row = await updateAppointment(userId, id, patch);
  return {
    appointment: {
      id: row.id,
      subject: row.subject,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      projectId: row.projectId,
      checkState: row.checkState,
    },
  };
}

export async function deleteAppointmentTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const id = requireString(args, "id");
  await deleteAppointment(userId, id);
  return { deleted: true, id };
}
