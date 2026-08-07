"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { nodes, resultAreaDetails } from "@/db/schema";
import { fromDateKey } from "@/lib/schedule/geometry";
import * as planning from "@/lib/planning/mutations";
import type { PlanEntryPatch, WeeklyPlanPatch } from "@/lib/planning/mutations";
import { run, type ActionResult } from "../../actionResult";

export async function startWeeklyPlanAction(input: {
  weekKey: string;
  weekStartsOn?: number;
  reviewAreasGoals?: boolean;
}): Promise<ActionResult> {
  return run((userId) =>
    planning.ensureWeeklyPlan(userId, {
      weekStart: fromDateKey(input.weekKey),
      weekStartsOn: input.weekStartsOn,
      reviewAreasGoals: input.reviewAreasGoals,
    }),
  );
}

export async function updateWeeklyPlanAction(
  id: string,
  patch: WeeklyPlanPatch,
): Promise<ActionResult> {
  return run((userId) => planning.updateWeeklyPlan(userId, id, patch));
}

export async function setWeeklyPlanCompletedAction(
  id: string,
  completed: boolean,
): Promise<ActionResult> {
  return run((userId) => planning.setWeeklyPlanCompleted(userId, id, completed));
}

export async function deleteWeeklyPlanAction(id: string): Promise<ActionResult> {
  return run((userId) => planning.deleteWeeklyPlan(userId, id));
}

export async function upsertPlanEntryAction(
  planId: string,
  nodeId: string,
  patch: PlanEntryPatch,
): Promise<ActionResult> {
  return run((userId) => planning.upsertPlanEntry(userId, planId, nodeId, patch));
}

export async function setFocusAreaAction(
  planId: string,
  nodeId: string,
  focus: boolean,
): Promise<ActionResult> {
  return run((userId) => planning.setFocusArea(userId, planId, nodeId, focus));
}

/**
 * Step 1 edits the result area's Mission in place. Written here rather than through
 * `saveNodeDetail`, which requires a full core-field payload the wizard does not hold.
 */
export async function saveMissionAction(
  nodeId: string,
  mission: string,
): Promise<ActionResult> {
  return run(async (userId) => {
    const [node] = await db
      .select({ id: nodes.id, type: nodes.type })
      .from(nodes)
      .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
      .limit(1);
    if (!node) throw new Error("Item not found.");
    if (node.type !== "result_area") {
      throw new Error("Mission is only available on Result Areas.");
    }
    await db.insert(resultAreaDetails).values({ nodeId, mission }).onConflictDoUpdate({
      target: resultAreaDetails.nodeId,
      set: { mission },
    });
    await db
      .update(nodes)
      .set({ updatedAt: new Date() })
      .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
  });
}
