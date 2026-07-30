import type { SessionInput } from "./types";

/**
 * Client draft shapes for the session editor. Pure conversion lives here so
 * autosave / validation logic can be tested without React.
 */

export type DraftSet = { reps: string; weight: string; unit: string };

export type DraftExercise = {
  key: string;
  exerciseId: string;
  exerciseName: string;
  sets: DraftSet[];
};

export type SessionDraft = {
  performedAt: string;
  title: string;
  notes: string;
  durationMinutes: string;
  exercises: DraftExercise[];
};

export function emptySet(unit = "lb"): DraftSet {
  return { reps: "", weight: "", unit };
}

/** New set copies the last one — the usual gym log behaviour for straight sets. */
export function setFromPrevious(previous: DraftSet | undefined): DraftSet {
  if (!previous) return emptySet();
  return {
    reps: previous.reps,
    weight: previous.weight,
    unit: previous.unit || "lb",
  };
}

function parseLocalInput(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

/**
 * Build a `SessionInput` ready for create/replace, or `null` if there is nothing
 * worth writing yet (no named exercise with at least one filled set).
 * Empty set rows and empty exercise blocks are dropped.
 */
export function draftToSessionInput(
  draft: SessionDraft,
  catalog: Array<{ id: string; name: string }>,
): SessionInput | null {
  const exercises = draft.exercises
    .map((block) => {
      const name = block.exerciseName.trim();
      const known = catalog.find((e) => e.id === block.exerciseId || e.name === name);
      const sets = block.sets
        .filter((s) => s.reps.trim() !== "" || s.weight.trim() !== "")
        .map((s) => ({
          reps: s.reps.trim() === "" ? null : Number(s.reps),
          weight: s.weight.trim() === "" ? null : Number(s.weight),
          unit: s.unit || "lb",
        }));

      if (sets.length === 0) return null;
      if (!known?.id && !name) return null;

      return {
        exerciseId: known?.id || block.exerciseId || undefined,
        exerciseName: name || known?.name,
        sets,
      };
    })
    .filter((block): block is NonNullable<typeof block> => block !== null);

  if (exercises.length === 0) return null;

  return {
    performedAt: parseLocalInput(draft.performedAt),
    title: draft.title,
    notes: draft.notes,
    durationMinutes:
      draft.durationMinutes.trim() === "" ? null : Number(draft.durationMinutes),
    exercises,
  };
}
