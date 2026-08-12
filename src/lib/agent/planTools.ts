/**
 * Agent tools over the weekly plan: start one, edit it, place entries, set focus areas.
 */

import {
  ensureWeeklyPlan,
  setFocusArea,
  setWeeklyPlanCompleted,
  updateWeeklyPlan,
  updateWeeklyPlanEntries,
  upsertPlanEntry,
  type PlanEntryPatch,
  type WeeklyPlanInput,
  type WeeklyPlanPatch,
} from "@/lib/planning/mutations";
import { loadWeeklyPlanPayload } from "@/lib/planning/queries";
import { startOfWeek } from "@/lib/schedule/geometry";
import { isSettled } from "@/lib/tree/completionCascade";
import { AgentError } from "./errors";
import {
  optionalBoolean,
  optionalNullableString,
  optionalNumber,
  optionalString,
  parseDate,
  requireString,
} from "./parse";
import { buildPathMap, iso, nodeSummary } from "./serialize";

function planWeekArgs(args: Record<string, unknown>): {
  weekStart: Date;
  weekStartsOn: number;
} {
  const weekStartsOn = optionalNumber(args, "weekStartsOn") ?? 0;
  const weekStartArg = optionalString(args, "weekStart");
  const weekStart = startOfWeek(
    weekStartArg ? (parseDate(weekStartArg, "weekStart") ?? new Date()) : new Date(),
    weekStartsOn,
  );
  return { weekStart, weekStartsOn };
}

export async function ensureWeeklyPlanTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const { weekStart, weekStartsOn } = planWeekArgs(args);
  const input: WeeklyPlanInput = {
    weekStart,
    weekStartsOn,
    reviewAreasGoals: optionalBoolean(args, "reviewAreasGoals"),
  };
  const plan = await ensureWeeklyPlan(userId, input);
  return {
    plan: {
      id: plan.id,
      weekStart: iso(plan.weekStart),
      weekStartsOn: plan.weekStartsOn,
      reviewAreasGoals: plan.reviewAreasGoals,
      availableMinutes: plan.availableMinutes,
      timeChartId: plan.timeChartId,
      completedAt: iso(plan.completedAt),
    },
  };
}

export async function updateWeeklyPlanTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const id = requireString(args, "id");
  const patch: WeeklyPlanPatch = {};
  if (args.weekStartsOn !== undefined) {
    patch.weekStartsOn = optionalNumber(args, "weekStartsOn");
  }
  if (args.reviewAreasGoals !== undefined) {
    patch.reviewAreasGoals = optionalBoolean(args, "reviewAreasGoals");
  }
  if (args.availableMinutes !== undefined) {
    const v = args.availableMinutes;
    if (v !== null && typeof v !== "number") {
      throw new AgentError("validation", "availableMinutes must be a number or null");
    }
    patch.availableMinutes = v;
  }
  if (args.timeChartId !== undefined) {
    patch.timeChartId = optionalNullableString(args, "timeChartId") ?? null;
  }
  if (args.blockSizeMinutes !== undefined) {
    patch.blockSizeMinutes = optionalNumber(args, "blockSizeMinutes");
  }
  if (args.avoidCollisions !== undefined) {
    patch.avoidCollisions = optionalBoolean(args, "avoidCollisions");
  }

  const plan = await updateWeeklyPlan(userId, id, patch);
  return {
    plan: {
      id: plan.id,
      weekStart: iso(plan.weekStart),
      availableMinutes: plan.availableMinutes,
      timeChartId: plan.timeChartId,
      blockSizeMinutes: plan.blockSizeMinutes,
      avoidCollisions: plan.avoidCollisions,
      completedAt: iso(plan.completedAt),
    },
  };
}

export async function upsertPlanEntryTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const planId = requireString(args, "planId");
  const nodeId = requireString(args, "nodeId");
  const patch: PlanEntryPatch = {};
  if (args.focus !== undefined) patch.focus = optionalBoolean(args, "focus");
  if (args.reviewed !== undefined) patch.reviewed = optionalBoolean(args, "reviewed");
  if (args.rewrite !== undefined) patch.rewrite = optionalString(args, "rewrite") ?? "";
  if (args.committedMinutes !== undefined) {
    const v = args.committedMinutes;
    if (v !== null && typeof v !== "number") {
      throw new AgentError("validation", "committedMinutes must be a number or null");
    }
    patch.committedMinutes = v;
  }

  const entry = await upsertPlanEntry(userId, planId, nodeId, patch);
  return {
    entry: {
      id: entry.id,
      planId: entry.planId,
      nodeId: entry.nodeId,
      focus: entry.focus,
      reviewed: entry.reviewed,
      rewrite: entry.rewrite,
      committedMinutes: entry.committedMinutes,
    },
  };
}

export async function setFocusAreaTool(userId: string, args: Record<string, unknown>) {
  const planId = requireString(args, "planId");
  const nodeId = requireString(args, "nodeId");
  const focus = optionalBoolean(args, "focus");
  if (focus === undefined) {
    throw new AgentError("validation", "focus is required");
  }
  const entry = await setFocusArea(userId, planId, nodeId, focus);
  return {
    entry: {
      id: entry.id,
      planId: entry.planId,
      nodeId: entry.nodeId,
      focus: entry.focus,
    },
  };
}

export async function updateWeeklyPlanEntriesTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const planId = requireString(args, "planId");
  if (!Array.isArray(args.entries) || args.entries.length === 0) {
    throw new AgentError("validation", "entries must contain at least one item");
  }
  if (args.entries.length > 100) {
    throw new AgentError("validation", "entries must contain at most 100 items");
  }
  const entries = args.entries.map((value, index) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new AgentError("validation", `entries[${index}] must be an object`);
    }
    const entryArgs = value as Record<string, unknown>;
    const nodeId = requireString(entryArgs, "nodeId");
    const patch: PlanEntryPatch = {};
    if (entryArgs.focus !== undefined) {
      patch.focus = optionalBoolean(entryArgs, "focus");
    }
    if (entryArgs.reviewed !== undefined) {
      patch.reviewed = optionalBoolean(entryArgs, "reviewed");
    }
    if (entryArgs.rewrite !== undefined) {
      patch.rewrite = optionalString(entryArgs, "rewrite") ?? "";
    }
    if (entryArgs.committedMinutes !== undefined) {
      const minutes = entryArgs.committedMinutes;
      if (minutes !== null && typeof minutes !== "number") {
        throw new AgentError(
          "validation",
          `entries[${index}].committedMinutes must be a number or null`,
        );
      }
      patch.committedMinutes = minutes;
    }
    return { nodeId, ...patch };
  });

  const rows = await updateWeeklyPlanEntries(userId, planId, entries);
  return {
    entries: rows.map((entry) => ({
      id: entry.id,
      planId: entry.planId,
      nodeId: entry.nodeId,
      focus: entry.focus,
      reviewed: entry.reviewed,
      rewrite: entry.rewrite,
      committedMinutes: entry.committedMinutes,
    })),
    applied: rows.length,
  };
}

export async function loadWeeklyPlanTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const { weekStart, weekStartsOn } = planWeekArgs(args);
  const payload = await loadWeeklyPlanPayload(userId, { weekStart, weekStartsOn });
  const paths = buildPathMap(payload.nodes);

  // Compact for agents — full outline is large; send summaries + plan machinery.
  return {
    weekStart: payload.weekStart,
    weekStartsOn: payload.weekStartsOn,
    plan: payload.plan
      ? {
          id: payload.plan.id,
          weekStart: iso(payload.plan.weekStart),
          weekStartsOn: payload.plan.weekStartsOn,
          reviewAreasGoals: payload.plan.reviewAreasGoals,
          availableMinutes: payload.plan.availableMinutes,
          timeChartId: payload.plan.timeChartId,
          blockSizeMinutes: payload.plan.blockSizeMinutes,
          avoidCollisions: payload.plan.avoidCollisions,
          completedAt: iso(payload.plan.completedAt),
        }
      : null,
    entries: payload.entries.map((e) => ({
      id: e.id,
      nodeId: e.nodeId,
      focus: e.focus,
      reviewed: e.reviewed,
      rewrite: e.rewrite,
      committedMinutes: e.committedMinutes,
    })),
    resultAreas: payload.nodes
      .filter((n) => n.type === "result_area")
      .map((n) => nodeSummary(n, paths)),
    goals: payload.nodes
      .filter(
        (n) =>
          n.type === "goal" &&
          (n.state === "not_started" || n.state === "in_progress") &&
          (n.priorityLetter === "A" || n.priorityLetter === null),
      )
      .map((n) => nodeSummary(n, paths)),
    projects: payload.nodes
      .filter((n) => n.type === "project" && !isSettled(n.state))
      .map((n) => nodeSummary(n, paths)),
    previousRewrites: payload.previousRewrites,
    schedule: {
      // The wizard always loads a week, so the range's start *is* the week start. The
      // contract keeps the week name because that is what this tool is about.
      weekStart: payload.schedule.rangeStart,
      appointmentCount: payload.schedule.occurrences.length,
      occurrences: payload.schedule.occurrences.map((o) => ({
        id: o.id,
        occurrenceKey: o.occurrenceKey,
        subject: o.subject,
        startAt: o.startAt.toISOString(),
        endAt: o.endAt.toISOString(),
        projectId: o.projectId,
      })),
    },
  };
}

export async function setWeeklyPlanCompletedTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const id = requireString(args, "id");
  const completed = optionalBoolean(args, "completed");
  if (completed === undefined) {
    throw new AgentError("validation", "completed is required");
  }
  const plan = await setWeeklyPlanCompleted(userId, id, completed);
  return {
    plan: {
      id: plan.id,
      completedAt: iso(plan.completedAt),
    },
  };
}
