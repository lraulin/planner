import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  exercises,
  workoutSessionExercises,
  workoutSessions,
  workoutSets,
} from "@/db/schema";
import { between } from "@/lib/tree/sortKey";
import { normaliseSetInput } from "./format";
import type { SessionInput } from "./types";

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

/** Create a catalog exercise. Name is trimmed; empty names are rejected. */
export async function createExercise(
  userId: string,
  name: string,
  notes = "",
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Exercise name is required.");

  const [row] = await db
    .insert(exercises)
    .values({ userId, name: trimmed, notes })
    .returning({ id: exercises.id });
  return row.id;
}

/**
 * Find an exercise by exact name (case-sensitive match on stored name after trim), or
 * create one. Used by the log flow so typing "Bench Press" just works.
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

export async function renameExercise(
  userId: string,
  exerciseId: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Exercise name is required.");

  const result = await db
    .update(exercises)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)))
    .returning({ id: exercises.id });

  if (result.length === 0) throw new Error("Exercise not found.");
}

export async function updateExerciseNotes(
  userId: string,
  exerciseId: string,
  notes: string,
): Promise<void> {
  const result = await db
    .update(exercises)
    .set({ notes, updatedAt: new Date() })
    .where(and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)))
    .returning({ id: exercises.id });

  if (result.length === 0) throw new Error("Exercise not found.");
}

/**
 * Delete a catalog exercise only when it has never been used in a session.
 * History is sacred — used exercises must be renamed, not wiped.
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

/**
 * Log a full session in one transaction: catalog resolve, ordered session-exercises, sets.
 */
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
      let exerciseId = block.exerciseId;
      if (exerciseId) {
        await requireExercise(tx, userId, exerciseId);
      } else if (block.exerciseName) {
        // Inline find-or-create inside the same tx.
        const name = block.exerciseName.trim();
        if (!name) throw new Error("Exercise name is required.");
        const [existing] = await tx
          .select({ id: exercises.id })
          .from(exercises)
          .where(and(eq(exercises.userId, userId), eq(exercises.name, name)))
          .limit(1);
        if (existing) {
          exerciseId = existing.id;
        } else {
          const [created] = await tx
            .insert(exercises)
            .values({ userId, name })
            .returning({ id: exercises.id });
          exerciseId = created.id;
        }
      } else {
        throw new Error("Each exercise needs an id or a name.");
      }

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

      if (!block.sets.length) {
        throw new Error("Each exercise needs at least one set.");
      }

      let setIndex = 1;
      for (const raw of block.sets) {
        const set = normaliseSetInput(raw);
        await tx.insert(workoutSets).values({
          userId,
          sessionExerciseId: sessionExercise.id,
          setIndex,
          reps: set.reps,
          weight: set.weight,
          unit: set.unit,
          completed: set.completed,
        });
        setIndex += 1;
      }
    }

    return session.id;
  });
}

/** Replace session metadata and rebuild exercises/sets (full rewrite for MVP edits). */
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

    // Cascade deletes sets via session_exercises.
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
      let exerciseId = block.exerciseId;
      if (exerciseId) {
        await requireExercise(tx, userId, exerciseId);
      } else if (block.exerciseName) {
        const name = block.exerciseName.trim();
        if (!name) throw new Error("Exercise name is required.");
        const [existing] = await tx
          .select({ id: exercises.id })
          .from(exercises)
          .where(and(eq(exercises.userId, userId), eq(exercises.name, name)))
          .limit(1);
        if (existing) {
          exerciseId = existing.id;
        } else {
          const [created] = await tx
            .insert(exercises)
            .values({ userId, name })
            .returning({ id: exercises.id });
          exerciseId = created.id;
        }
      } else {
        throw new Error("Each exercise needs an id or a name.");
      }

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

      if (!block.sets.length) {
        throw new Error("Each exercise needs at least one set.");
      }

      let setIndex = 1;
      for (const raw of block.sets) {
        const set = normaliseSetInput(raw);
        await tx.insert(workoutSets).values({
          userId,
          sessionExerciseId: sessionExercise.id,
          setIndex,
          reps: set.reps,
          weight: set.weight,
          unit: set.unit,
          completed: set.completed,
        });
        setIndex += 1;
      }
    }
  });
}

/** Explicit delete only — the "erroneous log" path. Cascades sets. */
export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  const result = await db
    .delete(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
    .returning({ id: workoutSessions.id });

  if (result.length === 0) throw new Error("Session not found.");
}

/** True when this exercise appears in any session for the user (used by UI/tests). */
export async function exerciseHasHistory(
  userId: string,
  exerciseId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`1` })
    .from(workoutSessionExercises)
    .where(
      and(
        eq(workoutSessionExercises.userId, userId),
        eq(workoutSessionExercises.exerciseId, exerciseId),
      ),
    )
    .limit(1);
  return Boolean(row);
}
