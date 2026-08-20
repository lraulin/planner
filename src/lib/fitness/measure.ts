import type { ExerciseMeasure } from "./types";

/**
 * What a set of a lift is measured in. A third catalog axis alongside `equipment` and
 * `unilateral`, and independent of both: load is still decided by the equipment, so a
 * weighted plank is `bodyweight === false` and `time` at the same time.
 */

export const MEASURE_OPTIONS: Array<{
  value: ExerciseMeasure;
  label: string;
}> = [
  { value: "reps", label: "Reps" },
  { value: "time", label: "Time" },
  { value: "reps_and_time", label: "Reps + hold" },
];

/**
 * Badge wording, which is not the select wording: the catalog asks what the lift is
 * measured in ("Time"), while the badge says what you will be doing ("Hold").
 */
const MEASURE_TAG: Record<ExerciseMeasure, string> = {
  reps: "",
  time: "Hold",
  reps_and_time: "Reps + hold",
};

export function isExerciseMeasure(value: string): value is ExerciseMeasure {
  return value === "reps" || value === "time" || value === "reps_and_time";
}

export function normaliseMeasure(value: string | null | undefined): ExerciseMeasure {
  if (value && isExerciseMeasure(value)) return value;
  return "reps";
}

export function tracksReps(measure: ExerciseMeasure): boolean {
  return measure === "reps" || measure === "reps_and_time";
}

export function tracksTime(measure: ExerciseMeasure): boolean {
  return measure === "time" || measure === "reps_and_time";
}

/**
 * Badge suffix beside the equipment tag. Reps is the default and says nothing, so it
 * gets no tag — only the shapes worth calling out do.
 */
export function formatMeasureTag(measure: ExerciseMeasure): string {
  return MEASURE_TAG[measure];
}
