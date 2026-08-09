import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  exercises,
  workoutSessionExercises,
  workoutSessions,
  workoutSets,
} from "@/db/schema";
import { between } from "@/lib/tree/sortKey";
import { DEFAULT_BAR_WEIGHT_LB, parseBarWeight } from "./bars";
import { coerceExercisePrefs, normaliseEquipment } from "./equipment";
import { normaliseSetInput } from "./format";
import type {
  ExerciseEquipment,
  ExercisePrefs,
  SessionExerciseInput,
  SessionInput,
} from "./types";

/**
 * Every mutation takes a `userId` and scopes on it. History rows never cascade from the
 * outline — only an explicit session delete removes sets.
 */

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

async function requireExercise(tx: Executor, userId: string, exerciseId: string) {
  const [row] = await tx
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Exercise not found.");
  return row;
}

async function requireSession(tx: Executor, userId: string, sessionId: string) {
  const [row] = await tx
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Session not found.");
  return row;
}

function prefsToColumns(prefs?: ExercisePrefs) {
  const coerced = coerceExercisePrefs({
    equipment: normaliseEquipment(prefs?.equipment),
    barWeight:
      prefs?.barWeight !== undefined
        ? parseBarWeight(prefs.barWeight)
        : DEFAULT_BAR_WEIGHT_LB,
    unilateral: prefs?.unilateral ?? false,
  });
  return {
    equipment: coerced.equipment,
    barWeight: String(coerced.barWeight),
    unilateral: coerced.unilateral,
    notes: prefs?.notes,
  };
}

/** Create a catalog exercise with equipment config. */
export async function createExercise(
  userId: string,
  name: string,
  prefs?: ExercisePrefs,
): Promise<string> {
  const trimmed = (prefs?.name ?? name).trim();
  if (!trimmed) throw new Error("Exercise name is required.");

  const cols = prefsToColumns(prefs);
  const [row] = await db
    .insert(exercises)
    .values({
      userId,
      name: trimmed,
      notes: cols.notes ?? "",
      equipment: cols.equipment,
      barWeight: cols.barWeight,
      unilateral: cols.unilateral,
    })
    .returning({ id: exercises.id });
  return row.id;
}

/**
 * Full catalog update (name + equipment + bar + unilateral + notes).
 * Partial keys only when present on prefs.
 */
export async function updateExercise(
  userId: string,
  exerciseId: string,
  prefs: ExercisePrefs,
): Promise<void> {
  await requireExercise(db, userId, exerciseId);

  const patch: {
    name?: string;
    notes?: string;
    equipment?: ExerciseEquipment;
    barWeight?: string;
    unilateral?: boolean;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (prefs.name !== undefined) {
    const trimmed = prefs.name.trim();
    if (!trimmed) throw new Error("Exercise name is required.");
    patch.name = trimmed;
  }
  if (prefs.notes !== undefined) patch.notes = prefs.notes;

  if (
    prefs.equipment !== undefined ||
    prefs.barWeight !== undefined ||
    prefs.unilateral !== undefined
  ) {
    const [current] = await db
      .select()
      .from(exercises)
      .where(and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)))
      .limit(1);
    const coerced = coerceExercisePrefs({
      equipment: normaliseEquipment(prefs.equipment ?? current.equipment),
      barWeight: parseBarWeight(
        prefs.barWeight !== undefined ? prefs.barWeight : current.barWeight,
      ),
      unilateral:
        prefs.unilateral !== undefined ? prefs.unilateral : current.unilateral,
    });
    patch.equipment = coerced.equipment;
    patch.barWeight = String(coerced.barWeight);
    patch.unilateral = coerced.unilateral;
  }

  const result = await db
    .update(exercises)
    .set(patch)
    .where(and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)))
    .returning({ id: exercises.id });

  if (result.length === 0) throw new Error("Exercise not found.");
}

async function resolveExerciseId(
  tx: Executor,
  userId: string,
  block: SessionExerciseInput,
): Promise<string> {
  if (block.exerciseId) {
    await requireExercise(tx, userId, block.exerciseId);
    return block.exerciseId;
  }
  if (block.exerciseName) {
    const name = block.exerciseName.trim();
    if (!name) throw new Error("Exercise name is required.");
    const [existing] = await tx
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(eq(exercises.userId, userId), eq(exercises.name, name)))
      .limit(1);
    if (existing) return existing.id;

    // Last-resort create with defaults — prefer catalog New exercise UI.
    const [created] = await tx
      .insert(exercises)
      .values({
        userId,
        name,
        equipment: "barbell",
        barWeight: String(DEFAULT_BAR_WEIGHT_LB),
        unilateral: false,
      })
      .returning({ id: exercises.id });
    return created.id;
  }
  throw new Error("Each exercise needs an id or a name.");
}

/**
 * Find an exercise by exact name, or create with default barbell prefs.
 */
export async function findOrCreateExercise(
  userId: string,
  name: string,
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Exercise name is required.");

  const [existing] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.userId, userId), eq(exercises.name, trimmed)))
    .limit(1);
  if (existing) return existing.id;

  return createExercise(userId, trimmed);
}

/**
 * Delete a catalog exercise only when it has never been used in a session.
 */
export async function deleteExercise(
  userId: string,
  exerciseId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await requireExercise(tx, userId, exerciseId);

    const [used] = await tx
      .select({ id: workoutSessionExercises.id })
      .from(workoutSessionExercises)
      .where(
        and(
          eq(workoutSessionExercises.userId, userId),
          eq(workoutSessionExercises.exerciseId, exerciseId),
        ),
      )
      .limit(1);

    if (used) {
      throw new Error("Cannot delete an exercise that has workout history.");
    }

    await tx
      .delete(exercises)
      .where(and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)));
  });
}

async function insertSets(
  tx: Executor,
  userId: string,
  sessionExerciseId: string,
  rawSets: SessionExerciseInput["sets"],
) {
  if (!rawSets.length) {
    throw new Error("Each exercise needs at least one set.");
  }
  let setIndex = 1;
  for (const raw of rawSets) {
    const set = normaliseSetInput(raw);
    await tx.insert(workoutSets).values({
      userId,
      sessionExerciseId,
      setIndex,
      reps: set.reps,
      repsLeft: set.repsLeft,
      repsRight: set.repsRight,
      weight: set.weight,
      unit: set.unit,
      completed: set.completed,
    });
    setIndex += 1;
  }
}

/** Log a full session in one transaction. */
export async function createSession(
  userId: string,
  input: SessionInput,
): Promise<string> {
  if (!input.exercises.length) {
    throw new Error("A session needs at least one exercise.");
  }

  return db.transaction(async (tx) => {
    const [session] = await tx
      .insert(workoutSessions)
      .values({
        userId,
        performedAt: input.performedAt,
        title: input.title?.trim() ?? "",
        notes: input.notes ?? "",
        durationMinutes: input.durationMinutes ?? null,
      })
      .returning({ id: workoutSessions.id });

    let prevKey: string | null = null;
    for (const block of input.exercises) {
      const exerciseId = await resolveExerciseId(tx, userId, block);
      const sortKey = between(prevKey, null);
      prevKey = sortKey;

      const [sessionExercise] = await tx
        .insert(workoutSessionExercises)
        .values({
          userId,
          sessionId: session.id,
          exerciseId,
          sortKey,
          notes: block.notes ?? "",
        })
        .returning({ id: workoutSessionExercises.id });

      await insertSets(tx, userId, sessionExercise.id, block.sets);
    }

    return session.id;
  });
}

/** Replace session metadata and rebuild exercises/sets. */
export async function replaceSession(
  userId: string,
  sessionId: string,
  input: SessionInput,
): Promise<void> {
  if (!input.exercises.length) {
    throw new Error("A session needs at least one exercise.");
  }

  await db.transaction(async (tx) => {
    await requireSession(tx, userId, sessionId);

    await tx
      .update(workoutSessions)
      .set({
        performedAt: input.performedAt,
        title: input.title?.trim() ?? "",
        notes: input.notes ?? "",
        durationMinutes: input.durationMinutes ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)),
      );

    await tx
      .delete(workoutSessionExercises)
      .where(
        and(
          eq(workoutSessionExercises.sessionId, sessionId),
          eq(workoutSessionExercises.userId, userId),
        ),
      );

    let prevKey: string | null = null;
    for (const block of input.exercises) {
      const exerciseId = await resolveExerciseId(tx, userId, block);
      const sortKey = between(prevKey, null);
      prevKey = sortKey;

      const [sessionExercise] = await tx
        .insert(workoutSessionExercises)
        .values({
          userId,
          sessionId,
          exerciseId,
          sortKey,
          notes: block.notes ?? "",
        })
        .returning({ id: workoutSessionExercises.id });

      await insertSets(tx, userId, sessionExercise.id, block.sets);
    }
  });
}

export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  const result = await db
    .delete(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
    .returning({ id: workoutSessions.id });

  if (result.length === 0) throw new Error("Session not found.");
}
