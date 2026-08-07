/**
 * The agent tool surface: the list of tool names, and the one place a name becomes a call.
 *
 * The handlers themselves live beside this file, one module per domain —
 * `outlineTools`, `noteTools`, `scheduleTools`, `planTools`, `metricTools`. This file used
 * to hold all twenty-six of them plus their parsing helpers, which meant every change to a
 * metric argument was a change to the same file as the outline search.
 *
 * The switch stays exhaustive and hand-written rather than a name-keyed record: `AgentToolName`
 * then makes a missing case a type error, and the argument each handler takes stays visible at
 * the call site.
 */

import { getAgentUserId } from "@/lib/auth/identity";
import { AgentError, toAgentError } from "./errors";
import { asObject } from "./parse";
import {
  captureTool,
  createNodeTool,
  getContext,
  getNode,
  searchNodes,
  updateNodeTool,
} from "./outlineTools";
import { createNoteTool, listNotesTool, updateNoteTool } from "./noteTools";
import {
  createAppointmentTool,
  deleteAppointmentTool,
  getWeekTool,
  updateAppointmentTool,
} from "./scheduleTools";
import {
  ensureWeeklyPlanTool,
  loadWeeklyPlanTool,
  setFocusAreaTool,
  setWeeklyPlanCompletedTool,
  updateWeeklyPlanTool,
  upsertPlanEntryTool,
} from "./planTools";
import {
  createMetricTool,
  getMetricTool,
  listMetricsTool,
  logMetricEntryTool,
  updateMetricEntryTool,
  updateMetricTool,
} from "./metricTools";

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
  "list_metrics",
  "get_metric",
  "create_metric",
  "update_metric",
  "log_metric_entry",
  "update_metric_entry",
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
      case "list_metrics":
        return await listMetricsTool(uid, args);
      case "get_metric":
        return await getMetricTool(uid, args);
      case "create_metric":
        return await createMetricTool(uid, args);
      case "update_metric":
        return await updateMetricTool(uid, args);
      case "log_metric_entry":
        return await logMetricEntryTool(uid, args);
      case "update_metric_entry":
        return await updateMetricEntryTool(uid, args);
    }
  } catch (err) {
    throw toAgentError(err);
  }
}
