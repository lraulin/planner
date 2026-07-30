import { DEFAULT_BAR_WEIGHT_LB, parseBarWeight } from "./bars";
import { isBodyweightUnit } from "./format";
import type { SessionInput, WorkoutSetView } from "./types";

/**
 * Client draft shapes for the session editor. Pure conversion lives here so
 * autosave / validation logic can be tested without React.
 */

export type DraftSet = { reps: string; weight: string; unit: string };

export type DraftExercise = {
  key: string;
  exerciseId: string;
  exerciseName: string;
  /** When true, sets store unit `bw` and hide weight — no zero-lb shame. */
  bodyweight: boolean;
  /** Bar mass in lb for plate calc; `0` = dumbbells / no plates. */
  barWeight: number;
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

export function emptyBodyweightSet(): DraftSet {
  return { reps: "", weight: "", unit: "bw" };
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

/** Flip bodyweight mode on a block; rewrites set units/weights. */
export function applyBodyweightMode(
  block: DraftExercise,
  bodyweight: boolean,
): DraftExercise {
  if (bodyweight) {
    return {
      ...block,
      bodyweight: true,
      sets: block.sets.map((s) => ({
        reps: s.reps,
        weight: "",
        unit: "bw",
      })),
    };
  }
  return {
    ...block,
    bodyweight: false,
    sets: block.sets.map((s) => ({
      reps: s.reps,
      weight: s.weight,
      unit: isBodyweightUnit(s.unit) ? "lb" : s.unit || "lb",
    })),
  };
}

/**
 * Copy prior session sets into the draft (click “Last time”).
 * Always yields at least one row so the table stays usable.
 */
export function setsFromHistory(
  historySets: Array<Pick<WorkoutSetView, "reps" | "weight" | "unit">>,
  bodyweight: boolean,
): DraftSet[] {
  if (historySets.length === 0) {
    return [bodyweight ? emptyBodyweightSet() : emptySet()];
  }

  if (bodyweight) {
    return historySets.map((s) => ({
      reps: s.reps == null ? "" : String(s.reps),
      weight: "",
      unit: "bw",
    }));
  }

  return historySets.map((s) => {
    const unit = isBodyweightUnit(s.unit) ? "lb" : s.unit || "lb";
    return {
      reps: s.reps == null ? "" : String(s.reps),
      weight: s.weight == null ? "" : String(s.weight),
      unit,
    };
  });
}

function parseLocalInput(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function setIsFilled(set: DraftSet, bodyweight: boolean): boolean {
  if (bodyweight || isBodyweightUnit(set.unit)) {
    return set.reps.trim() !== "";
  }
  return set.reps.trim() !== "" || set.weight.trim() !== "";
}

/**
 * Build a `SessionInput` ready for create/replace, or `null` if there is nothing
 * worth writing yet (no named exercise with at least one filled set).
 * Empty set rows and empty exercise blocks are dropped.
 * Bodyweight + bar prefs ride along so the catalog stays in sync.
 */
export function draftToSessionInput(
  draft: SessionDraft,
  catalog: Array<{ id: string; name: string }>,
): SessionInput | null {
  const exercises = draft.exercises
    .map((block) => {
      const name = block.exerciseName.trim();
      const known = catalog.find((e) => e.id === block.exerciseId || e.name === name);
      const bodyweight = block.bodyweight;
      const barWeight = parseBarWeight(block.barWeight);

      const sets = block.sets
        .filter((s) => setIsFilled(s, bodyweight))
        .map((s) => {
          if (bodyweight || isBodyweightUnit(s.unit)) {
            return {
              reps: s.reps.trim() === "" ? null : Number(s.reps),
              weight: null,
              unit: "bw",
            };
          }
          return {
            reps: s.reps.trim() === "" ? null : Number(s.reps),
            weight: s.weight.trim() === "" ? null : Number(s.weight),
            unit: s.unit || "lb",
          };
        });

      if (sets.length === 0) return null;
      if (!known?.id && !name) return null;

      return {
        exerciseId: known?.id || block.exerciseId || undefined,
        exerciseName: name || known?.name,
        bodyweight,
        barWeight,
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

export { DEFAULT_BAR_WEIGHT_LB };
