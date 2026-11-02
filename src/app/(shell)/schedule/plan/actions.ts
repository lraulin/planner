"use server";

import { fromDateKey } from "@/lib/schedule/geometry";
import * as planning from "@/lib/planning/mutations";
import type { PlanEntryPatch, WeeklyPlanPatch } from "@/lib/planning/mutations";
import { run, type ActionResult } from "@/app/actionResult";
import { setResultAreaFields } from "@/lib/detail/mutations";

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

/** Step 1 edits the result area's Mission in place. */
export async function saveMissionAction(
  nodeId: string,
  mission: string,
): Promise<ActionResult> {
  return run((userId) => setResultAreaFields(userId, nodeId, { mission }));
}
