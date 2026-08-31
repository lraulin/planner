import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  exercises,
  workoutSessionExercises,
  workoutSessionGroups,
  workoutSessions,
  workoutSets,
} from "@/db/schema";
import { DEFAULT_BAR_WEIGHT_LB } from "./bars";
import { normaliseEquipment } from "./equipment";
import { normaliseMeasure } from "./measure";
import { formatSetsLabel } from "./format";
import { isRepeatableTitle, normalisedTitle, titlesMatch } from "./titleMatch";
import type {
  ExerciseHistoryEntry,
  ExerciseSummary,
  RepeatableTitle,
  SessionDetail,
  SessionSummary,
  WorkoutSetView,
} from "./types";

function weightNumber(raw: string | null): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function mapExercise(row: {
  id: string;
  name: string;
  notes: string;
  equipment: string;
  measure: string;
  barWeight: string;
  unilateral: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ExerciseSummary {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    equipment: normaliseEquipment(row.equipment),
    measure: normaliseMeasure(row.measure),
    barWeight: weightNumber(row.barWeight) ?? DEFAULT_BAR_WEIGHT_LB,
    unilateral: row.unilateral,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapSet(row: {
  id: string;
  setIndex: number;
  reps: number | null;
  repsLeft: number | null;
  repsRight: number | null;
  durationSeconds: number | null;
  weight: string | null;
  unit: string;
  completed: boolean;
}): WorkoutSetView {
  return {
    id: row.id,
    setIndex: row.setIndex,
    reps: row.reps,
    repsLeft: row.repsLeft,
    repsRight: row.repsRight,
    durationSeconds: row.durationSeconds,
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

  return rows.map(mapExercise);
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
  return mapExercise(row);
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
  const incompleteBySession = new Map<string, boolean>();
  for (const se of seRows) {
    const sets = setsBySe.get(se.id) ?? [];
    const label = `${se.exerciseName} ${formatSetsLabel(sets)}`;
    const list = labelsBySession.get(se.sessionId) ?? [];
    list.push(label);
    labelsBySession.set(se.sessionId, list);
    if (sets.some((s) => !s.completed)) {
      incompleteBySession.set(se.sessionId, true);
    }
  }

  return sessions.map((s) => ({
    id: s.id,
    performedAt: s.performedAt,
    title: s.title,
    notes: s.notes,
    durationMinutes: s.durationMinutes,
    exerciseLabels: labelsBySession.get(s.id) ?? [],
    isIncomplete: incompleteBySession.get(s.id) === true,
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
      groupId: workoutSessionExercises.groupId,
      exerciseName: exercises.name,
      equipment: exercises.equipment,
      measure: exercises.measure,
      barWeight: exercises.barWeight,
      unilateral: exercises.unilateral,
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

  const groupRows = await db
    .select()
    .from(workoutSessionGroups)
    .where(
      and(
        eq(workoutSessionGroups.userId, userId),
        eq(workoutSessionGroups.sessionId, sessionId),
      ),
    );

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
      equipment: normaliseEquipment(se.equipment),
      measure: normaliseMeasure(se.measure),
      barWeight: weightNumber(se.barWeight) ?? DEFAULT_BAR_WEIGHT_LB,
      unilateral: se.unilateral,
      sortKey: se.sortKey,
      notes: se.notes,
      groupId: se.groupId,
      sets: setsBySe.get(se.id) ?? [],
    })),
    // Unordered on purpose: a group's position comes from its members, not from itself.
    groups: groupRows.map((g) => ({
      id: g.id,
      label: g.label,
      restSeconds: g.restSeconds,
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

export async function loadLatestForExercise(
  userId: string,
  exerciseId: string,
  options?: { excludeSessionId?: string | null; sessionTitle?: string | null },
): Promise<ExerciseHistoryEntry | null> {
  const history = await loadExerciseHistory(userId, exerciseId);
  const exclude = options?.excludeSessionId;
  const eligible = exclude
    ? history.filter((entry) => entry.sessionId !== exclude)
    : history;
  const title = options?.sessionTitle?.trim();
  if (title) {
    const sameTitle = eligible.find((entry) => titlesMatch(entry.sessionTitle, title));
    if (sameTitle) return sameTitle;
  }
  return eligible[0] ?? null;
}

export async function latestSessionByTitle(
  userId: string,
  title: string,
): Promise<SessionDetail | null> {
  const key = normalisedTitle(title);
  if (!key) return null;

  const [row] = await db
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        sql`lower(trim(${workoutSessions.title})) = ${key}`,
      ),
    )
    .orderBy(desc(workoutSessions.performedAt))
    .limit(1);

  if (!row) return null;
  return getSessionDetail(userId, row.id);
}

export async function listRepeatableTitles(userId: string): Promise<RepeatableTitle[]> {
  const sessions = await db
    .select({
      id: workoutSessions.id,
      title: workoutSessions.title,
      performedAt: workoutSessions.performedAt,
    })
    .from(workoutSessions)
    .where(eq(workoutSessions.userId, userId))
    .orderBy(desc(workoutSessions.performedAt));

  const latestByTitle = new Map<string, (typeof sessions)[number]>();
  for (const session of sessions) {
    if (!isRepeatableTitle(session.title)) continue;
    const key = normalisedTitle(session.title);
    if (!latestByTitle.has(key)) latestByTitle.set(key, session);
  }

  const latest = [...latestByTitle.values()];
  if (latest.length === 0) return [];

  const sessionIds = latest.map((s) => s.id);
  const seRows = await db
    .select({
      id: workoutSessionExercises.id,
      sessionId: workoutSessionExercises.sessionId,
    })
    .from(workoutSessionExercises)
    .where(
      and(
        eq(workoutSessionExercises.userId, userId),
        inArray(workoutSessionExercises.sessionId, sessionIds),
      ),
    );

  const seIds = seRows.map((r) => r.id);
  const setRows =
    seIds.length === 0
      ? []
      : await db
          .select({
            sessionExerciseId: workoutSets.sessionExerciseId,
            completed: workoutSets.completed,
          })
          .from(workoutSets)
          .where(
            and(
              eq(workoutSets.userId, userId),
              inArray(workoutSets.sessionExerciseId, seIds),
            ),
          );

  const exerciseCount = new Map<string, number>();
  const seSession = new Map<string, string>();
  for (const se of seRows) {
    exerciseCount.set(se.sessionId, (exerciseCount.get(se.sessionId) ?? 0) + 1);
    seSession.set(se.id, se.sessionId);
  }

  const incomplete = new Set<string>();
  for (const set of setRows) {
    if (set.completed) continue;
    const sessionId = seSession.get(set.sessionExerciseId);
    if (sessionId) incomplete.add(sessionId);
  }

  return latest.map((session) => ({
    title: session.title,
    lastPerformedAt: session.performedAt,
    sessionId: session.id,
    exerciseCount: exerciseCount.get(session.id) ?? 0,
    isIncomplete: incomplete.has(session.id),
  }));
}
