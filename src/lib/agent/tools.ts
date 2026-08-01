import type { NoteFlag } from "@/db/schema";
import { getAgentUserId } from "@/lib/auth/identity";
import { createNote, updateNote as updateNoteMutation } from "@/lib/notes/mutations";
import { loadNotes, loadNotesForNode } from "@/lib/notes/queries";
import {
  ensureWeeklyPlan,
  setFocusArea,
  setWeeklyPlanCompleted,
  updateWeeklyPlan,
  upsertPlanEntry,
  type PlanEntryPatch,
  type WeeklyPlanInput,
  type WeeklyPlanPatch,
} from "@/lib/planning/mutations";
import { getWeeklyPlan, loadWeeklyPlanPayload } from "@/lib/planning/queries";
import {
  createAppointment,
  deleteAppointment,
  updateAppointment,
  type AppointmentInput,
} from "@/lib/schedule/mutations";
import { loadSchedule } from "@/lib/schedule/queries";
import { startOfWeek, toDateKey } from "@/lib/schedule/geometry";
import { captureItems } from "@/lib/capture/mutations";
import {
  createNode,
  renameNode,
  setDeadline,
  setEffort,
  setFocus,
  setPriority,
  setState,
} from "@/lib/tree/mutations";
import { loadOutline } from "@/lib/tree/queries";
import { parseCaptureArgs } from "./captureArgs";
import { AgentError, toAgentError } from "./errors";
import {
  asObject,
  optionalBoolean,
  optionalNullableString,
  optionalNumber,
  optionalString,
  optionalStringArray,
  parseDate,
  parseNodeState,
  parseNodeType,
  parsePriorityLetter,
  requireString,
} from "./parse";
import { filterOutline, type SearchNodesFilter } from "./search";
import { buildPathMap, iso, nodeSummary, noteSummary } from "./serialize";

export const AGENT_TOOLS = [
  "health",
  "get_context",
  "search_nodes",
  "get_node",
  "create_node",
  "capture",
  "update_node",
  "create_note",
  "update_note",
  "list_notes",
  "get_week",
  "create_appointment",
  "update_appointment",
  "delete_appointment",
  "ensure_weekly_plan",
  "update_weekly_plan",
  "upsert_plan_entry",
  "set_focus_area",
  "load_weekly_plan",
  "set_weekly_plan_completed",
] as const;

export type AgentToolName = (typeof AGENT_TOOLS)[number];

export function isAgentTool(name: string): name is AgentToolName {
  return (AGENT_TOOLS as readonly string[]).includes(name);
}

/**
 * Resolve the account the Bearer key maps to (no browser session).
 *
 * Still one key per deployment mapping to one configured account — `PLANNER_AGENT_USER_EMAIL`,
 * required in production. Per-user keys are the seam this function would grow into.
 */
export async function resolveAgentUserId(): Promise<string> {
  return getAgentUserId();
}

export async function dispatchAgentTool(
  tool: string,
  body: unknown,
  userId?: string,
): Promise<unknown> {
  try {
    if (!isAgentTool(tool)) {
      throw new AgentError("not_found", `Unknown tool: ${tool}`);
    }
    const uid = userId ?? (await resolveAgentUserId());
    const args = asObject(body);

    switch (tool) {
      case "health":
        return { status: "ok", tools: AGENT_TOOLS };
      case "get_context":
        return await getContext(uid, args);
      case "search_nodes":
        return await searchNodes(uid, args);
      case "get_node":
        return await getNode(uid, args);
      case "create_node":
        return await createNodeTool(uid, args);
      case "capture":
        return await captureTool(uid, args);
      case "update_node":
        return await updateNodeTool(uid, args);
      case "create_note":
        return await createNoteTool(uid, args);
      case "update_note":
        return await updateNoteTool(uid, args);
      case "list_notes":
        return await listNotesTool(uid, args);
      case "get_week":
        return await getWeekTool(uid, args);
      case "create_appointment":
        return await createAppointmentTool(uid, args);
      case "update_appointment":
        return await updateAppointmentTool(uid, args);
      case "delete_appointment":
        return await deleteAppointmentTool(uid, args);
      case "ensure_weekly_plan":
        return await ensureWeeklyPlanTool(uid, args);
      case "update_weekly_plan":
        return await updateWeeklyPlanTool(uid, args);
      case "upsert_plan_entry":
        return await upsertPlanEntryTool(uid, args);
      case "set_focus_area":
        return await setFocusAreaTool(uid, args);
      case "load_weekly_plan":
        return await loadWeeklyPlanTool(uid, args);
      case "set_weekly_plan_completed":
        return await setWeeklyPlanCompletedTool(uid, args);
    }
  } catch (err) {
    throw toAgentError(err);
  }
}

// --- outline / context -----------------------------------------------------

async function getContext(userId: string, args: Record<string, unknown>) {
  const weekStartsOn = optionalNumber(args, "weekStartsOn") ?? 0;
  const now = new Date();
  const outline = await loadOutline(userId);
  const paths = buildPathMap(outline);

  const focus = outline
    .filter((n) => n.focus && n.state !== "completed" && n.state !== "cancelled")
    .map((n) => nodeSummary(n, paths));

  const openWork = outline
    .filter(
      (n) =>
        (n.type === "task" || n.type === "project") &&
        n.state !== "completed" &&
        n.state !== "cancelled" &&
        (n.priorityLetter === "A" || n.priorityLetter === "B" || n.focus),
    )
    .sort((a, b) => {
      const letter = (x: typeof a) =>
        x.priorityLetter === "A" ? 0 : x.priorityLetter === "B" ? 1 : 2;
      return letter(a) - letter(b) || (a.priorityRank ?? 99) - (b.priorityRank ?? 99);
    })
    .slice(0, 25)
    .map((n) => nodeSummary(n, paths));

  const weekStart = startOfWeek(now, weekStartsOn);
  const plan = await getWeeklyPlan(userId, weekStart, weekStartsOn);
  const schedule = await loadSchedule(userId, { weekStart, weekStartsOn });

  return {
    asOf: now.toISOString(),
    weekStart: toDateKey(weekStart),
    focus,
    topOpenWork: openWork,
    weeklyPlan: plan
      ? {
          id: plan.id,
          weekStart: iso(plan.weekStart),
          completedAt: iso(plan.completedAt),
          availableMinutes: plan.availableMinutes,
          timeChartId: plan.timeChartId,
        }
      : null,
    weekAppointmentCount: schedule.occurrences.length,
  };
}

async function searchNodes(userId: string, args: Record<string, unknown>) {
  const outline = await loadOutline(userId);
  const filter: SearchNodesFilter = {
    includeCompleted: optionalBoolean(args, "includeCompleted"),
    focus: optionalBoolean(args, "focus"),
    query: optionalString(args, "query"),
    limit: optionalNumber(args, "limit"),
  };

  if ("parentId" in args) {
    const p = args.parentId;
    if (p !== null && typeof p !== "string") {
      throw new AgentError("validation", "parentId must be a string or null");
    }
    filter.parentId = p;
  }

  if (args.type !== undefined) {
    if (Array.isArray(args.type)) {
      filter.type = args.type.map((t) => parseNodeType(t, "type"));
    } else {
      filter.type = parseNodeType(args.type, "type");
    }
  }
  if (args.state !== undefined) {
    if (Array.isArray(args.state)) {
      filter.state = args.state.map((s) => parseNodeState(s, "state"));
    } else {
      filter.state = parseNodeState(args.state, "state");
    }
  }

  return { nodes: filterOutline(outline, filter) };
}

async function getNode(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const outline = await loadOutline(userId);
  const node = outline.find((n) => n.id === id);
  if (!node) throw new AgentError("not_found", `Node not found: ${id}`);
  const paths = buildPathMap(outline);
  return { node: nodeSummary(node, paths) };
}

async function createNodeTool(userId: string, args: Record<string, unknown>) {
  const type = parseNodeType(args.type, "type");
  const name = optionalString(args, "name") ?? "";
  // Omitting parentId means the top level, which now hosts every type — an agent capturing
  // a task it has not placed yet should not have to invent a parent for it. `createNode`
  // still rejects a nesting that goes backwards, so the rule lives in one place.
  let parentId: string | null = null;
  if ("parentId" in args) {
    if (args.parentId !== null && typeof args.parentId !== "string") {
      throw new AgentError("validation", "parentId must be a string or null");
    }
    parentId = args.parentId;
  }

  const id = await createNode({ userId, parentId, type, name });

  if (args.state !== undefined) {
    await setState(userId, id, parseNodeState(args.state));
  }
  if (args.priorityLetter !== undefined) {
    await setPriority(
      userId,
      id,
      parsePriorityLetter(args.priorityLetter),
      optionalNumber(args, "priorityRank") ?? null,
    );
  }
  if (args.deadline !== undefined) {
    const d = parseDate(optionalNullableString(args, "deadline") ?? null, "deadline");
    await setDeadline(userId, id, d ?? null);
  }
  if (args.focus !== undefined) {
    await setFocus(userId, id, optionalBoolean(args, "focus") ?? false);
  }
  if (args.effortMinutes !== undefined && type === "task") {
    await setEffort(userId, id, optionalNumber(args, "effortMinutes") ?? null);
  }

  return getNode(userId, { id });
}

/**
 * GTD capture into the Inbox — same path as the in-app `c` box.
 *
 * Distinct from `create_node` without parentId, which creates a root-level task. Root is a
 * legitimate resting place ("I know what this is"); the Inbox is for unprocessed ideas.
 * External clients (Alfred, the Reminders Shortcut) must not invent that distinction
 * themselves.
 *
 * Takes one item or a batch — see `parseCaptureArgs`. Items carrying an `externalId` are
 * created at most once ever, which is what makes a half-finished import safe to re-run.
 */
async function captureTool(userId: string, args: Record<string, unknown>) {
  const { items, single } = parseCaptureArgs(args);

  const { results, nodeIds, parentId } = await captureItems({ userId, items });

  if (!single) {
    return {
      parentId,
      created: results.filter((r) => r.created).length,
      skipped: results.filter((r) => !r.created).length,
      results,
    };
  }

  const id = nodeIds[0];
  if (!id) {
    throw new AgentError("internal", "capture produced no node");
  }

  const result = (await getNode(userId, { id })) as {
    node: { id: string; parentId: string | null; name: string; type: string };
  };
  return {
    node: result.node,
    parentId,
    created: results[0].created,
    // Kept under its original name: Alfred's success path reads this field.
    createdIds: nodeIds,
  };
}

async function updateNodeTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  // Prove ownership before applying patches (mutations that no-op on missing rows).
  await getNode(userId, { id });

  if (args.name !== undefined) {
    await renameNode(userId, id, requireString(args, "name"));
  }
  if (args.state !== undefined) {
    await setState(userId, id, parseNodeState(args.state));
  }
  if (args.priorityLetter !== undefined) {
    await setPriority(
      userId,
      id,
      parsePriorityLetter(args.priorityLetter),
      optionalNumber(args, "priorityRank") ?? null,
    );
  } else if (args.priorityRank !== undefined) {
    throw new AgentError(
      "validation",
      "priorityRank requires priorityLetter in the same call",
    );
  }
  if (args.deadline !== undefined) {
    const d = parseDate(optionalNullableString(args, "deadline") ?? null, "deadline");
    await setDeadline(userId, id, d ?? null);
  }
  if (args.focus !== undefined) {
    await setFocus(userId, id, optionalBoolean(args, "focus") ?? false);
  }
  if (args.effortMinutes !== undefined) {
    await setEffort(userId, id, optionalNumber(args, "effortMinutes") ?? null);
  }

  return getNode(userId, { id });
}

// --- notes -----------------------------------------------------------------

async function createNoteTool(userId: string, args: Record<string, unknown>) {
  const title = optionalString(args, "title") ?? "";
  const subject = optionalString(args, "subject");
  const body = optionalString(args, "body") ?? "";
  const nodeId = optionalNullableString(args, "nodeId");
  const noteDate = parseDate(
    optionalNullableString(args, "noteDate") ?? undefined,
    "noteDate",
  );
  const flag = optionalString(args, "flag") as NoteFlag | undefined;
  const contexts = optionalStringArray(args, "contexts");

  const id = await createNote({
    userId,
    values: {
      title,
      subject: subject ?? "General",
      body,
      nodeId: nodeId === undefined ? null : nodeId,
      noteDate: noteDate === undefined ? undefined : noteDate,
      flag: flag ?? "none",
      contexts: contexts ?? [],
    },
  });

  const notes = await loadNotes(userId);
  const note = notes.find((n) => n.id === id);
  if (!note) throw new AgentError("internal", "Created note missing on reload");
  return { note: noteSummary(note) };
}

async function updateNoteTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const patch: Parameters<typeof updateNoteMutation>[2] = {};
  if (args.title !== undefined) patch.title = requireString(args, "title");
  if (args.subject !== undefined) patch.subject = requireString(args, "subject");
  if (args.body !== undefined) patch.body = optionalString(args, "body") ?? "";
  if (args.nodeId !== undefined) {
    patch.nodeId = optionalNullableString(args, "nodeId") ?? null;
  }
  if (args.noteDate !== undefined) {
    patch.noteDate =
      parseDate(optionalNullableString(args, "noteDate") ?? null, "noteDate") ?? null;
  }
  if (args.flag !== undefined) {
    patch.flag = requireString(args, "flag") as NoteFlag;
  }
  if (args.contexts !== undefined) {
    patch.contexts = optionalStringArray(args, "contexts") ?? [];
  }

  await updateNoteMutation(userId, id, patch);
  const notes = await loadNotes(userId);
  const note = notes.find((n) => n.id === id);
  if (!note) throw new AgentError("not_found", "Note not found.");
  return { note: noteSummary(note) };
}

async function listNotesTool(userId: string, args: Record<string, unknown>) {
  const nodeId = optionalString(args, "nodeId");
  const limit = Math.min(Math.max(optionalNumber(args, "limit") ?? 30, 1), 100);

  if (nodeId) {
    const notes = await loadNotesForNode(userId, nodeId);
    return { notes: notes.slice(0, limit).map(noteSummary) };
  }

  const notes = await loadNotes(userId);
  // Most recent first by noteDate / updatedAt-ish: outline order is tree order; reverse for capture feel.
  const sorted = [...notes].sort((a, b) => {
    const ta = (a.noteDate ?? a.updatedAt).getTime();
    const tb = (b.noteDate ?? b.updatedAt).getTime();
    return tb - ta;
  });
  return { notes: sorted.slice(0, limit).map(noteSummary) };
}

// --- schedule --------------------------------------------------------------

async function getWeekTool(userId: string, args: Record<string, unknown>) {
  const weekStartsOn = optionalNumber(args, "weekStartsOn") ?? 0;
  const weekStartArg = optionalString(args, "weekStart");
  const weekStart = startOfWeek(
    weekStartArg ? (parseDate(weekStartArg, "weekStart") ?? new Date()) : new Date(),
    weekStartsOn,
  );
  const schedule = await loadSchedule(userId, { weekStart, weekStartsOn });
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

async function createAppointmentTool(userId: string, args: Record<string, unknown>) {
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

async function updateAppointmentTool(userId: string, args: Record<string, unknown>) {
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

async function deleteAppointmentTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  await deleteAppointment(userId, id);
  return { deleted: true, id };
}

// --- weekly plan -----------------------------------------------------------

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

async function ensureWeeklyPlanTool(userId: string, args: Record<string, unknown>) {
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

async function updateWeeklyPlanTool(userId: string, args: Record<string, unknown>) {
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

async function upsertPlanEntryTool(userId: string, args: Record<string, unknown>) {
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

async function setFocusAreaTool(userId: string, args: Record<string, unknown>) {
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

async function loadWeeklyPlanTool(userId: string, args: Record<string, unknown>) {
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
      .filter(
        (n) =>
          n.type === "project" && n.state !== "completed" && n.state !== "cancelled",
      )
      .map((n) => nodeSummary(n, paths)),
    previousRewrites: payload.previousRewrites,
    schedule: {
      weekStart: payload.schedule.weekStart,
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

async function setWeeklyPlanCompletedTool(
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
