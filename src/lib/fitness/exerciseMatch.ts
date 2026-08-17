import { formatExerciseSelectLabel } from "./equipment";
import type { ExerciseEquipment } from "./types";

/** The catalog fields matching and labels need — not a full `ExerciseSummary`. */
export type ExerciseMatchInput = {
  id: string;
  name: string;
  equipment: ExerciseEquipment;
  barWeight: number;
  unilateral: boolean;
};

/** Same label the picker shows: "Curl · Dumbbell", "Curl · Barbell · EZ 15". */
export function exerciseOptionLabel(exercise: ExerciseMatchInput): string {
  return formatExerciseSelectLabel(
    exercise.name,
    exercise.equipment,
    exercise.barWeight,
    exercise.unilateral,
  );
}

/**
 * Catalog rows that match a type-in query, best first.
 *
 * Empty query keeps the given order (callers already sort by name). Matching is
 * case-insensitive substring against the name and the select label, so "bench",
 * "dumbbell", and "ez" all work. Multi-word queries require every token.
 *
 * Ranking is prefix-on-name first: typing "press" should not bury Bench Press
 * under Incline Bench Press just because both contain the letters.
 */
export function matchExercises<T extends ExerciseMatchInput>(
  catalog: readonly T[],
  query: string,
): T[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [...catalog];

  const tokens = trimmed.split(/\s+/);
  const scored: { exercise: T; score: number }[] = [];

  for (const exercise of catalog) {
    const name = exercise.name.toLowerCase();
    const label = exerciseOptionLabel(exercise).toLowerCase();
    const score = scoreMatch(name, label, trimmed, tokens);
    if (score !== null) scored.push({ exercise, score });
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.map((row) => row.exercise);
}

/**
 * What committing typed text should select. Exact label, then a unique exact
 * name (two Curls stay unresolved), then the only remaining match. `null`
 * means revert — do not invent a catalog row from a typo.
 */
export function resolveExerciseQuery<T extends ExerciseMatchInput>(
  catalog: readonly T[],
  query: string,
): T | null {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return null;

  const exactLabel = catalog.find(
    (exercise) => exerciseOptionLabel(exercise).toLowerCase() === trimmed,
  );
  if (exactLabel) return exactLabel;

  const exactName = catalog.filter(
    (exercise) => exercise.name.toLowerCase() === trimmed,
  );
  if (exactName.length === 1) return exactName[0];

  const matches = matchExercises(catalog, query);
  return matches.length === 1 ? matches[0] : null;
}

function scoreMatch(
  name: string,
  label: string,
  query: string,
  tokens: string[],
): number | null {
  if (name.startsWith(query)) return 0;
  if (name.includes(query)) return 1;
  if (label.startsWith(query)) return 2;
  if (label.includes(query)) return 3;
  if (tokens.length > 1 && tokens.every((token) => label.includes(token))) {
    return 4;
  }
  return null;
}
