/**
 * Fitness domain types. Sessions own ordered exercises and sets; exercises are a catalog.
 * Workout history lives here, not on outline tasks.
 */

export type WeightUnit = "lb" | "kg";

/** How the lift is loaded — catalog source of truth for the session logger UI. */
export type ExerciseEquipment =
  "barbell" | "dumbbell" | "kettlebell" | "club" | "mace" | "bodyweight";

/**
 * What a set is measured in. Independent of `equipment` — a weighted plank is `time`
 * and still records a load.
 */
export type ExerciseMeasure = "reps" | "time" | "reps_and_time";

export type ExerciseSummary = {
  id: string;
  name: string;
  notes: string;
  equipment: ExerciseEquipment;
  /** Reps, a timed hold, or reps then a hold. */
  measure: ExerciseMeasure;
  /** Bar mass in lb when equipment is barbell. */
  barWeight: number;
  /** Left/right reps when the equipment allows unilateral. */
  unilateral: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ExercisePrefs = {
  name?: string;
  notes?: string;
  equipment?: ExerciseEquipment;
  measure?: ExerciseMeasure;
  barWeight?: number;
  unilateral?: boolean;
};

export type SetInput = {
  reps?: number | null;
  repsLeft?: number | null;
  repsRight?: number | null;
  /** Hold or carry seconds; set alongside reps for a reps-then-hold set. */
  durationSeconds?: number | null;
  weight?: number | null;
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
  repsLeft: number | null;
  repsRight: number | null;
  durationSeconds: number | null;
  weight: number | null;
  unit: string;
  completed: boolean;
};

export type SessionExerciseView = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  equipment: ExerciseEquipment;
  measure: ExerciseMeasure;
  barWeight: number;
  unilateral: boolean;
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
