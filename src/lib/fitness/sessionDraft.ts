import { DEFAULT_BAR_WEIGHT_LB } from "./bars";
import { effectiveUnilateral, normaliseEquipment, usesWeight } from "./equipment";
import { isBodyweightUnit } from "./format";
import type {
  ExerciseEquipment,
  ExerciseSummary,
  SessionInput,
  WorkoutSetView,
} from "./types";

/**
 * Client draft shapes for the session editor. Pure conversion lives here so
 * autosave / validation logic can be tested without React.
 */

export type DraftSet = {
  reps: string;
  repsLeft: string;
  repsRight: string;
  weight: string;
  unit: string;
};

export type DraftExercise = {
  key: string;
  exerciseId: string;
  exerciseName: string;
  equipment: ExerciseEquipment;
  barWeight: number;
  unilateral: boolean;
  /** That lift, that day — not catalog notes. */
  notes: string;
  sets: DraftSet[];
};

export type SessionDraft = {
  performedAt: string;
  title: string;
  notes: string;
  durationMinutes: string;
  exercises: DraftExercise[];
};

export function emptyBilateralSet(unit = "lb"): DraftSet {
  return { reps: "", repsLeft: "", repsRight: "", weight: "", unit };
}

export function emptyUnilateralSet(unit = "lb"): DraftSet {
  return { reps: "", repsLeft: "", repsRight: "", weight: "", unit };
}

export function emptySetForExercise(block: {
  equipment: ExerciseEquipment;
  unilateral: boolean;
}): DraftSet {
  const uni = effectiveUnilateral(block.equipment, block.unilateral);
  const unit = block.equipment === "bodyweight" ? "bw" : "lb";
  return uni ? emptyUnilateralSet(unit) : emptyBilateralSet(unit);
}

/** New set copies the last one — straight sets / same L/R pattern. */
export function setFromPrevious(
  previous: DraftSet | undefined,
  block: { equipment: ExerciseEquipment; unilateral: boolean },
): DraftSet {
  if (!previous) return emptySetForExercise(block);
  return {
    reps: previous.reps,
    repsLeft: previous.repsLeft,
    repsRight: previous.repsRight,
    weight: previous.weight,
    unit: previous.unit || (block.equipment === "bodyweight" ? "bw" : "lb"),
  };
}

/**
 * Copy prior session sets into the draft (click “Last time”).
 * Always yields at least one row so the table stays usable.
 */
export function setsFromHistory(
  historySets: Array<
    Pick<WorkoutSetView, "reps" | "repsLeft" | "repsRight" | "weight" | "unit">
  >,
  block: { equipment: ExerciseEquipment; unilateral: boolean },
): DraftSet[] {
  const uni = effectiveUnilateral(block.equipment, block.unilateral);
  if (historySets.length === 0) return [emptySetForExercise(block)];

  return historySets.map((s) => {
    if (uni) {
      return {
        reps: "",
        repsLeft:
          s.repsLeft != null
            ? String(s.repsLeft)
            : s.reps != null
              ? String(s.reps)
              : "",
        repsRight:
          s.repsRight != null
            ? String(s.repsRight)
            : s.reps != null
              ? String(s.reps)
              : "",
        weight:
          block.equipment === "bodyweight" || s.weight == null ? "" : String(s.weight),
        unit: block.equipment === "bodyweight" ? "bw" : s.unit || "lb",
      };
    }
    return {
      reps: s.reps == null ? "" : String(s.reps),
      repsLeft: "",
      repsRight: "",
      weight:
        block.equipment === "bodyweight" || s.weight == null ? "" : String(s.weight),
      unit:
        block.equipment === "bodyweight"
          ? "bw"
          : isBodyweightUnit(s.unit)
            ? "lb"
            : s.unit || "lb",
    };
  });
}

function parseLocalInput(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function setIsFilled(
  set: DraftSet,
  equipment: ExerciseEquipment,
  unilateral: boolean,
): boolean {
  const uni = effectiveUnilateral(equipment, unilateral);
  if (uni) {
    return set.repsLeft.trim() !== "" || set.repsRight.trim() !== "";
  }
  if (equipment === "bodyweight") {
    return set.reps.trim() !== "";
  }
  return set.reps.trim() !== "" || set.weight.trim() !== "";
}

/**
 * Build a `SessionInput` ready for create/replace, or `null` if nothing to write.
 * Requires a catalog exercise id (or known name) and at least one filled set.
 * Does not write equipment prefs — catalog is source of truth.
 */
export function draftToSessionInput(
  draft: SessionDraft,
  catalog: Array<{ id: string; name: string }>,
): SessionInput | null {
  const exercises = draft.exercises
    .map((block) => {
      const name = block.exerciseName.trim();
      const known = catalog.find((e) => e.id === block.exerciseId || e.name === name);
      const equipment = normaliseEquipment(block.equipment);
      const unilateral = effectiveUnilateral(equipment, block.unilateral);

      const sets = block.sets
        .filter((s) => setIsFilled(s, equipment, block.unilateral))
        .map((s) => {
          if (equipment === "bodyweight") {
            if (unilateral) {
              return {
                reps: null,
                repsLeft: s.repsLeft.trim() === "" ? null : Number(s.repsLeft),
                repsRight: s.repsRight.trim() === "" ? null : Number(s.repsRight),
                weight: null,
                unit: "bw",
              };
            }
            return {
              reps: s.reps.trim() === "" ? null : Number(s.reps),
              repsLeft: null,
              repsRight: null,
              weight: null,
              unit: "bw",
            };
          }
          if (unilateral) {
            return {
              reps: null,
              repsLeft: s.repsLeft.trim() === "" ? null : Number(s.repsLeft),
              repsRight: s.repsRight.trim() === "" ? null : Number(s.repsRight),
              weight: s.weight.trim() === "" ? null : Number(s.weight),
              unit: s.unit || "lb",
            };
          }
          return {
            reps: s.reps.trim() === "" ? null : Number(s.reps),
            repsLeft: null,
            repsRight: null,
            weight: s.weight.trim() === "" ? null : Number(s.weight),
            unit: s.unit || "lb",
          };
        });

      if (sets.length === 0) return null;
      if (!known?.id && !name) return null;

      return {
        exerciseId: known?.id || block.exerciseId || undefined,
        exerciseName: name || known?.name,
        notes: block.notes,
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

/** Seed a draft block from a catalog exercise. */
export function draftBlockFromCatalog(
  exercise: ExerciseSummary,
  key = crypto.randomUUID(),
): DraftExercise {
  return {
    key,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    equipment: exercise.equipment,
    barWeight: exercise.barWeight,
    unilateral: exercise.unilateral,
    notes: "",
    sets: [emptySetForExercise(exercise)],
  };
}

export function emptyDraftBlock(): DraftExercise {
  return {
    key: crypto.randomUUID(),
    exerciseId: "",
    exerciseName: "",
    equipment: "barbell",
    barWeight: DEFAULT_BAR_WEIGHT_LB,
    unilateral: false,
    notes: "",
    sets: [emptyBilateralSet("lb")],
  };
}

export { usesWeight, DEFAULT_BAR_WEIGHT_LB };
