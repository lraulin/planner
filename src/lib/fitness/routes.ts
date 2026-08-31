/**
 * Fitness URL helpers. Path-based so reload keeps sessions / exercises / log / editors.
 *
 *   /fitness                        → redirects to the page you were last on
 *   /fitness/sessions               ┐ the two pages, in the page bar
 *   /fitness/exercises              ┘
 *   /fitness/log?exercise=          ┐
 *   /fitness/sessions/[sessionId]   │ focused flows and editors — never in the bar
 *   /fitness/exercises/new          │
 *   /fitness/exercises/[exerciseId] ┘
 */

export function fitnessSessionsPath(): string {
  return "/fitness/sessions";
}

export function fitnessExercisesPath(): string {
  return "/fitness/exercises";
}

export function fitnessLogPath(
  options?: {
    from?: string | null;
    exercise?: string | null;
  } | null,
): string {
  const from = options?.from?.trim();
  const exercise = options?.exercise?.trim();
  if (from) {
    return `/fitness/log?from=${encodeURIComponent(from)}`;
  }
  if (exercise) {
    return `/fitness/log?exercise=${encodeURIComponent(exercise)}`;
  }
  return "/fitness/log";
}

export function startAgainPath(sessionId: string, isIncomplete: boolean): string {
  return isIncomplete
    ? fitnessSessionPath(sessionId)
    : fitnessLogPath({ from: sessionId });
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
