"use server";

import { revalidatePath } from "next/cache";
import type { NodeState, PriorityLetter } from "@/db/schema";
import { getCurrentUserId } from "@/lib/auth";
import * as day from "@/lib/day/mutations";
import type { DayAssignment } from "@/lib/day/priority";

/**
 * Thin wrappers: resolve the user, delegate, and return `{ ok: false, error }` rather than
 * throwing, so a rejected save renders inline instead of crashing the view. Same `run()`
 * shape as `src/app/notes/actions.ts`.
 */

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

async function run<T>(work: (userId: string) => Promise<T>): Promise<ActionResult> {
  try {
    const userId = await getCurrentUserId();
    const result = await work(userId);
    revalidatePath("/", "layout");
    return typeof result === "string" ? { ok: true, id: result } : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

export async function createDailyItemAction(params: {
  day: string;
  title: string;
  nodeId?: string | null;
  priorityLetter?: PriorityLetter | null;
  priorityRank?: number | null;
}): Promise<ActionResult> {
  return run((userId) => day.createDailyItem({ userId, ...params }));
}

export async function updateDailyItemTitleAction(
  itemId: string,
  title: string,
): Promise<ActionResult> {
  return run((userId) => day.updateDailyItemTitle(userId, itemId, title));
}

export async function setDailyItemStateAction(
  itemId: string,
  state: NodeState,
): Promise<ActionResult> {
  return run((userId) => day.setDailyItemState(userId, itemId, state));
}

export async function setDailyPrioritiesAction(
  assignments: DayAssignment[],
): Promise<ActionResult> {
  return run((userId) => day.setDailyPriorities(userId, assignments));
}

export async function moveDailyItemToDayAction(
  itemId: string,
  target: string,
): Promise<ActionResult> {
  return run((userId) => day.moveDailyItemToDay(userId, itemId, target));
}

export async function deleteDailyItemAction(itemId: string): Promise<ActionResult> {
  return run((userId) => day.deleteDailyItem(userId, itemId));
}

/** Backs both the week view's drop targets and the task form's "Plan for day" field. */
export async function planNodeForDayAction(
  nodeId: string,
  target: string | null,
): Promise<ActionResult> {
  return run((userId) => day.planNodeForDay(userId, nodeId, target));
}

export async function promoteToTaskAction(itemId: string): Promise<ActionResult> {
  return run((userId) => day.promoteToTask(userId, itemId));
}

export async function saveJournalAction(
  target: string,
  body: string,
): Promise<ActionResult> {
  return run((userId) => day.saveJournal(userId, target, body));
}
