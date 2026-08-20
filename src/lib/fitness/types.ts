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

/**
 * A superset / circuit / mechanical drop set. No round count: rounds are `max(sets)` across
 * the members, so there is nothing here that could disagree with what was logged.
 */
export type SessionGroupInput = {
  /** Display only — never branched on. */
  label?: string;
  /** Rest after each round. */
  restSeconds?: number | null;
};

export type SessionExerciseInput = {
  /** Existing catalog id, or omit and pass `exerciseName` to create/find by name. */
  exerciseId?: string;
  exerciseName?: string;
  notes?: string;
  /** Index into `SessionInput.groups`; omit for a straight, ungrouped exercise. */
  groupIndex?: number | null;
  sets: SetInput[];
};

/**
 * Exercises stay one flat ordered array even when grouped — membership is a pointer, so
 * ordering keeps its single rule and a group's members are contiguous by construction.
 */
export type SessionInput = {
  performedAt: Date;
  title?: string;
  notes?: string;
  durationMinutes?: number | null;
  groups?: SessionGroupInput[];
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
  /** Which group this block belongs to, or null for a straight exercise. */
  groupId: string | null;
  sets: WorkoutSetView[];
};

export type SessionGroupMeta = {
  id: string;
  label: string;
  restSeconds: number | null;
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
  /**
   * Flat and ordered, grouped or not, so history, labels and Find keep reading one list.
   * `sessionGroups.ts` folds it into groups for display.
   */
  exercises: SessionExerciseView[];
  groups: SessionGroupMeta[];
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
