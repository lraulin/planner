import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  exercises,
  workoutSessionExercises,
  workoutSessions,
  workoutSets,
} from "@/db/schema";
import { formatSetsLabel } from "./format";
import type {
  ExerciseHistoryEntry,
  ExerciseSummary,
  SessionDetail,
  SessionSummary,
  WorkoutSetView,
} from "./types";

function weightNumber(raw: string | null): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function mapSet(row: {
  id: string;
  setIndex: number;
  reps: number | null;
  weight: string | null;
  unit: string;
  completed: boolean;
}): WorkoutSetView {
  return {
    id: row.id,
    setIndex: row.setIndex,
    reps: row.reps,
    weight: weightNumber(row.weight),
    unit: row.unit,
    completed: row.completed,
  };
}

export async function listExercises(userId: string): Promise<ExerciseSummary[]> {
  const rows = await db
    .select()
    .from(exercises)
    .where(eq(exercises.userId, userId))
    .orderBy(asc(exercises.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function getExercise(
  userId: string,
  exerciseId: string,
): Promise<ExerciseSummary | null> {
  const [row] = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listSessions(userId: string): Promise<SessionSummary[]> {
  const sessions = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.userId, userId))
    .orderBy(desc(workoutSessions.performedAt));

  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);

  const seRows = await db
    .select({
      id: workoutSessionExercises.id,
      sessionId: workoutSessionExercises.sessionId,
      sortKey: workoutSessionExercises.sortKey,
      exerciseName: exercises.name,
    })
    .from(workoutSessionExercises)
    .innerJoin(exercises, eq(exercises.id, workoutSessionExercises.exerciseId))
    .where(
      and(
        eq(workoutSessionExercises.userId, userId),
        inArray(workoutSessionExercises.sessionId, sessionIds),
      ),
    )
    .orderBy(asc(workoutSessionExercises.sortKey));

  const seIds = seRows.map((r) => r.id);

  const setRows =
    seIds.length === 0
      ? []
      : await db
          .select()
          .from(workoutSets)
          .where(
            and(
              eq(workoutSets.userId, userId),
              inArray(workoutSets.sessionExerciseId, seIds),
            ),
          )
          .orderBy(asc(workoutSets.setIndex));

  const setsBySe = new Map<string, WorkoutSetView[]>();
  for (const set of setRows) {
    const list = setsBySe.get(set.sessionExerciseId) ?? [];
    list.push(mapSet(set));
    setsBySe.set(set.sessionExerciseId, list);
  }

  const labelsBySession = new Map<string, string[]>();
  for (const se of seRows) {
    const sets = setsBySe.get(se.id) ?? [];
    const label = `${se.exerciseName} ${formatSetsLabel(sets)}`;
    const list = labelsBySession.get(se.sessionId) ?? [];
    list.push(label);
    labelsBySession.set(se.sessionId, list);
  }

  return sessions.map((s) => ({
    id: s.id,
    performedAt: s.performedAt,
    title: s.title,
    notes: s.notes,
    durationMinutes: s.durationMinutes,
    exerciseLabels: labelsBySession.get(s.id) ?? [],
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
}

export async function getSessionDetail(
  userId: string,
  sessionId: string,
): Promise<SessionDetail | null> {
  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
    .limit(1);
  if (!session) return null;

  const seRows = await db
    .select({
      id: workoutSessionExercises.id,
      exerciseId: workoutSessionExercises.exerciseId,
      sortKey: workoutSessionExercises.sortKey,
      notes: workoutSessionExercises.notes,
      exerciseName: exercises.name,
    })
    .from(workoutSessionExercises)
    .innerJoin(exercises, eq(exercises.id, workoutSessionExercises.exerciseId))
    .where(
      and(
        eq(workoutSessionExercises.userId, userId),
        eq(workoutSessionExercises.sessionId, sessionId),
      ),
    )
    .orderBy(asc(workoutSessionExercises.sortKey));

  const seIds = seRows.map((r) => r.id);
  const setRows =
    seIds.length === 0
      ? []
      : await db
          .select()
          .from(workoutSets)
          .where(
            and(
              eq(workoutSets.userId, userId),
              inArray(workoutSets.sessionExerciseId, seIds),
            ),
          )
          .orderBy(asc(workoutSets.setIndex));

  const setsBySe = new Map<string, WorkoutSetView[]>();
  for (const set of setRows) {
    const list = setsBySe.get(set.sessionExerciseId) ?? [];
    list.push(mapSet(set));
    setsBySe.set(set.sessionExerciseId, list);
  }

  return {
    id: session.id,
    performedAt: session.performedAt,
    title: session.title,
    notes: session.notes,
    durationMinutes: session.durationMinutes,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    exercises: seRows.map((se) => ({
      id: se.id,
      exerciseId: se.exerciseId,
      exerciseName: se.exerciseName,
      sortKey: se.sortKey,
      notes: se.notes,
      sets: setsBySe.get(se.id) ?? [],
    })),
  };
}

export async function loadExerciseHistory(
  userId: string,
  exerciseId: string,
): Promise<ExerciseHistoryEntry[]> {
  const seRows = await db
    .select({
      sessionExerciseId: workoutSessionExercises.id,
      sessionId: workoutSessions.id,
      performedAt: workoutSessions.performedAt,
      sessionTitle: workoutSessions.title,
    })
    .from(workoutSessionExercises)
    .innerJoin(
      workoutSessions,
      eq(workoutSessions.id, workoutSessionExercises.sessionId),
    )
    .where(
      and(
        eq(workoutSessionExercises.userId, userId),
        eq(workoutSessionExercises.exerciseId, exerciseId),
        eq(workoutSessions.userId, userId),
      ),
    )
    .orderBy(desc(workoutSessions.performedAt));

  if (seRows.length === 0) return [];

  const seIds = seRows.map((r) => r.sessionExerciseId);
  const setRows = await db
    .select()
    .from(workoutSets)
    .where(
      and(
        eq(workoutSets.userId, userId),
        inArray(workoutSets.sessionExerciseId, seIds),
      ),
    )
    .orderBy(asc(workoutSets.setIndex));

  const setsBySe = new Map<string, WorkoutSetView[]>();
  for (const set of setRows) {
    const list = setsBySe.get(set.sessionExerciseId) ?? [];
    list.push(mapSet(set));
    setsBySe.set(set.sessionExerciseId, list);
  }

  return seRows.map((r) => ({
    sessionId: r.sessionId,
    sessionExerciseId: r.sessionExerciseId,
    performedAt: r.performedAt,
    sessionTitle: r.sessionTitle,
    sets: setsBySe.get(r.sessionExerciseId) ?? [],
  }));
}

/** Most recent history entry for an exercise — task drawer summary. */
export async function loadLatestForExercise(
  userId: string,
  exerciseId: string,
): Promise<ExerciseHistoryEntry | null> {
  const history = await loadExerciseHistory(userId, exerciseId);
  return history[0] ?? null;
}
