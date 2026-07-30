/**
 * Fitness domain types. Sessions own ordered exercises and sets; exercises are a catalog.
 * Outline tasks may optionally link to an exercise for planning — that link is not the
 * system of record for what was lifted.
 */

export type WeightUnit = "lb" | "kg";

export type ExerciseSummary = {
  id: string;
  name: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
};

export type SetInput = {
  reps: number | null;
  weight: number | null;
  unit?: WeightUnit | string;
  completed?: boolean;
};

export type SessionExerciseInput = {
  /** Existing catalog id, or omit and pass `exerciseName` to create/find by name. */
  exerciseId?: string;
  exerciseName?: string;
  notes?: string;
  sets: SetInput[];
};

export type SessionInput = {
  performedAt: Date;
  title?: string;
  notes?: string;
  durationMinutes?: number | null;
  exercises: SessionExerciseInput[];
};

export type WorkoutSetView = {
  id: string;
  setIndex: number;
  reps: number | null;
  weight: number | null;
  unit: string;
  completed: boolean;
};

export type SessionExerciseView = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  sortKey: string;
  notes: string;
  sets: WorkoutSetView[];
};

export type SessionSummary = {
  id: string;
  performedAt: Date;
  title: string;
  notes: string;
  durationMinutes: number | null;
  /** Short labels for list rows, e.g. "Bench Press 3×5 @ 185 lb". */
  exerciseLabels: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type SessionDetail = {
  id: string;
  performedAt: Date;
  title: string;
  notes: string;
  durationMinutes: number | null;
  exercises: SessionExerciseView[];
  createdAt: Date;
  updatedAt: Date;
};

/** Chronological log of one lift across sessions. */
export type ExerciseHistoryEntry = {
  sessionId: string;
  sessionExerciseId: string;
  performedAt: Date;
  sessionTitle: string;
  sets: WorkoutSetView[];
};
