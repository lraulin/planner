"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import * as fitness from "@/lib/fitness/mutations";
import {
  getSessionDetail,
  listExercises,
  listSessions,
  loadExerciseHistory,
  loadLatestForExercise,
} from "@/lib/fitness/queries";
import type { SessionInput } from "@/lib/fitness/types";

export type ActionResult =
  { ok: true; id?: string; data?: unknown } | { ok: false; error: string };

async function run<T>(work: (userId: string) => Promise<T>): Promise<ActionResult> {
  try {
    const userId = await getCurrentUserId();
    const result = await work(userId);
    revalidatePath("/fitness");
    revalidatePath("/", "layout");
    if (typeof result === "string") return { ok: true, id: result };
    if (result === undefined || result === null) return { ok: true };
    return { ok: true, data: result };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

export async function createExerciseAction(name: string, notes?: string) {
  return run((userId) => fitness.createExercise(userId, name, notes));
}

export async function renameExerciseAction(id: string, name: string) {
  return run((userId) => fitness.renameExercise(userId, id, name));
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

export async function listSessionsAction() {
  return run((userId) => listSessions(userId));
}

export async function getSessionDetailAction(sessionId: string) {
  return run((userId) => getSessionDetail(userId, sessionId));
}

export async function loadExerciseHistoryAction(exerciseId: string) {
  return run((userId) => loadExerciseHistory(userId, exerciseId));
}

export async function loadLatestForExerciseAction(
  exerciseId: string,
  excludeSessionId?: string | null,
) {
  return run((userId) =>
    loadLatestForExercise(userId, exerciseId, { excludeSessionId }),
  );
}
