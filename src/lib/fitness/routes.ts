/**
 * Fitness URL helpers. Path-based so reload keeps sessions / exercises / log / editors.
 *
 *   /fitness
 *   /fitness/exercises
 *   /fitness/log?exercise=
 *   /fitness/sessions/[sessionId]
 *   /fitness/exercises/new
 *   /fitness/exercises/[exerciseId]
 */

export function fitnessSessionsPath(): string {
  return "/fitness";
}

export function fitnessExercisesPath(): string {
  return "/fitness/exercises";
}

export function fitnessLogPath(exerciseId?: string | null): string {
  if (exerciseId) {
    return `/fitness/log?exercise=${encodeURIComponent(exerciseId)}`;
  }
  return "/fitness/log";
}

export function fitnessSessionPath(sessionId: string): string {
  return `/fitness/sessions/${sessionId}`;
}

export function fitnessExerciseNewPath(): string {
  return "/fitness/exercises/new";
}

export function fitnessExerciseEditPath(exerciseId: string): string {
  return `/fitness/exercises/${exerciseId}`;
}
