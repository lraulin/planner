/**
 * Agent tools over the outline: context, search, read, create, capture, update.
 *
 * Every handler takes `(userId, args)` and returns a plain JSON-serialisable value;
 * `tools.ts` owns the name-to-handler mapping and the error translation.
 */

import { captureItems } from "@/lib/capture/mutations";
import { saveNodeDetail } from "@/lib/detail/mutations";
import { loadNodeDetail } from "@/lib/detail/queries";
import type { NodeDetailPatch } from "@/lib/detail/types";
import { getWeeklyPlan } from "@/lib/planning/queries";
import { loadSchedule } from "@/lib/schedule/queries";
import { startOfWeek, toDateKey } from "@/lib/schedule/geometry";
import { createNode } from "@/lib/tree/mutations";
import { loadOutline } from "@/lib/tree/queries";
import { parseCaptureArgs } from "./captureArgs";
import {
  detailPatchHasWrites,
  parseNodeDetailPatch,
  stripCreateOnlyArgs,
} from "./detailArgs";
import { AgentError } from "./errors";
import {
  optionalBoolean,
  optionalNumber,
  optionalString,
  parseNodeState,
  parseNodeType,
  requireString,
} from "./parse";
import { filterOutline, type SearchNodesFilter } from "./search";
import { buildPathMap, iso, nodeDetailForAgent, nodeSummary } from "./serialize";
import { RESULT_AREA_STATE_REFUSAL } from "@/lib/tree/lifecycle";

function assertResultAreaLifecyclePatch(
  type: "result_area" | "goal" | "project" | "task",
  patch: NodeDetailPatch,
): void {
  if (type !== "result_area") return;
  if (patch.state !== undefined && patch.state !== null) {
    throw new AgentError("validation", RESULT_AREA_STATE_REFUSAL);
  }
  if (patch.deferredDate != null) {
    throw new AgentError("validation", "Result Areas cannot be postponed");
  }
}

export async function getContext(userId: string, args: Record<string, unknown>) {
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

export async function searchNodes(userId: string, args: Record<string, unknown>) {
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

export async function getNode(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const detail = await loadNodeDetail(userId, id);
  if (!detail) throw new AgentError("not_found", `Node not found: ${id}`);
  const outline = await loadOutline(userId);
  const row = outline.find((n) => n.id === id);
  const paths = buildPathMap(outline);
  return { node: nodeDetailForAgent(detail, row, paths) };
}

export async function createNodeTool(userId: string, args: Record<string, unknown>) {
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

  // Full form fields (notes, purpose, dates, …) go through the same allowlisted save as
  // the drawer. Type / parentId only apply at create time.
  const patch = parseNodeDetailPatch(stripCreateOnlyArgs(args));
  // Validate before insertion so a rejected create cannot leave an empty Result Area behind.
  assertResultAreaLifecyclePatch(type, patch);
  // Name is also passed into createNode so the row is not briefly untitled if the patch
  // write fails; saveNodeDetail will re-apply it when present.
  const id = await createNode({
    userId,
    parentId,
    type,
    name: patch.name ?? name,
    notes: patch.notes ?? "",
  });

  if (detailPatchHasWrites(patch)) {
    await saveNodeDetail(userId, id, patch);
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
export async function captureTool(userId: string, args: Record<string, unknown>) {
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

export async function updateNodeTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  // Prove ownership first so a missing id is `not_found` before we parse a large patch.
  const current = await getNode(userId, { id });

  const patch = parseNodeDetailPatch(stripCreateOnlyArgs(args));
  assertResultAreaLifecyclePatch(current.node.type, patch);
  if (detailPatchHasWrites(patch)) {
    await saveNodeDetail(userId, id, patch);
  }

  return getNode(userId, { id });
}
