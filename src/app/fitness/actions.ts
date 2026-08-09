"use server";

import * as fitness from "@/lib/fitness/mutations";
import { listExercises, loadLatestForExercise } from "@/lib/fitness/queries";
import type { ExercisePrefs, SessionInput } from "@/lib/fitness/types";
import {
  runWithData,
  type DataActionResult,
  type RevalidateTarget,
} from "../actionResult";

export type ActionResult = DataActionResult<unknown>;

/**
 * Fitness reads through its action surface as well as writing to it, so results carry
 * `data`. The extra `/fitness` targets are belt-and-braces on top of the root layout.
 */
const FITNESS_REVALIDATE: readonly RevalidateTarget[] = [
  { path: "/fitness" },
  { path: "/fitness", type: "layout" },
  { path: "/", type: "layout" },
];

function run<T>(work: (userId: string) => Promise<T>): Promise<ActionResult> {
  return runWithData(work, { revalidate: FITNESS_REVALIDATE });
}

export async function createExerciseAction(name: string, prefs?: ExercisePrefs) {
  return run((userId) => fitness.createExercise(userId, name, prefs));
}

export async function updateExerciseAction(id: string, prefs: ExercisePrefs) {
  return run((userId) => fitness.updateExercise(userId, id, prefs));
}

export async function deleteExerciseAction(id: string) {
  return run((userId) => fitness.deleteExercise(userId, id));
}

export async function createSessionAction(input: SessionInput) {
  return run((userId) => fitness.createSession(userId, input));
}

export async function replaceSessionAction(sessionId: string, input: SessionInput) {
  return run((userId) => fitness.replaceSession(userId, sessionId, input));
}

export async function deleteSessionAction(sessionId: string) {
  return run((userId) => fitness.deleteSession(userId, sessionId));
}

export async function listExercisesAction() {
  return run((userId) => listExercises(userId));
}

export async function loadLatestForExerciseAction(
  exerciseId: string,
  excludeSessionId?: string | null,
) {
  return run((userId) =>
    loadLatestForExercise(userId, exerciseId, { excludeSessionId }),
  );
}
