import { DEFAULT_BAR_WEIGHT_LB } from "./bars";
import { parseDurationSeconds } from "./duration";
import { effectiveUnilateral, normaliseEquipment, usesWeight } from "./equipment";
import { isBodyweightUnit } from "./format";
import { normaliseMeasure, tracksReps, tracksTime } from "./measure";
import type {
  ExerciseEquipment,
  ExerciseMeasure,
  ExerciseSummary,
  SessionDetail,
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
  /** Typed hold — seconds, or `m:ss`. Kept as text so a half-typed value survives. */
  duration: string;
  weight: string;
  unit: string;
  /** Explicit tap. Prefill is a plan, not a completed set. */
  completed: boolean;
};

/**
 * A superset / circuit / mechanical drop set in the editor. `id` is client-generated and
 * lives only as long as the draft — groups are rebuilt on every save, so nothing outside the
 * session references one.
 */
export type DraftGroup = {
  id: string;
  label: string;
  /** Rest after a round. Text, like `DraftSet.duration`, so a half-typed value survives. */
  rest: string;
};

export type DraftExercise = {
  key: string;
  /** `DraftGroup.id`, or null for a straight exercise. */
  groupId: string | null;
  exerciseId: string;
  exerciseName: string;
  equipment: ExerciseEquipment;
  measure: ExerciseMeasure;
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
  groups: DraftGroup[];
  /** Flat and ordered; a group's members are contiguous. */
  exercises: DraftExercise[];
};

export function emptyBilateralSet(unit = "lb"): DraftSet {
  return {
    reps: "",
    repsLeft: "",
    repsRight: "",
    duration: "",
    weight: "",
    unit,
    completed: false,
  };
}

export function emptyUnilateralSet(unit = "lb"): DraftSet {
  return {
    reps: "",
    repsLeft: "",
    repsRight: "",
    duration: "",
    weight: "",
    unit,
    completed: false,
  };
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
    duration: previous.duration,
    weight: previous.weight,
    unit: previous.unit || (block.equipment === "bodyweight" ? "bw" : "lb"),
    completed: false,
  };
}

/**
 * Copy prior session sets into the draft (click “Last time”).
 * Always yields at least one row so the table stays usable.
 */
export function setsFromHistory(
  historySets: Array<
    Pick<
      WorkoutSetView,
      "reps" | "repsLeft" | "repsRight" | "durationSeconds" | "weight" | "unit"
    >
  >,
  block: {
    equipment: ExerciseEquipment;
    measure: ExerciseMeasure;
    unilateral: boolean;
  },
): DraftSet[] {
  const uni = effectiveUnilateral(block.equipment, block.unilateral);
  const measure = normaliseMeasure(block.measure);
  if (historySets.length === 0) return [emptySetForExercise(block)];

  // History can predate a catalog change, so drop whatever the exercise no longer tracks.
  const duration = (s: { durationSeconds: number | null }) =>
    tracksTime(measure) && s.durationSeconds != null ? String(s.durationSeconds) : "";
  const weight = (s: { weight: number | null }) =>
    block.equipment === "bodyweight" || s.weight == null ? "" : String(s.weight);

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
        duration: duration(s),
        weight: weight(s),
        unit: block.equipment === "bodyweight" ? "bw" : s.unit || "lb",
        completed: false,
      };
    }
    return {
      reps: s.reps == null ? "" : String(s.reps),
      repsLeft: "",
      repsRight: "",
      duration: duration(s),
      weight: weight(s),
      unit:
        block.equipment === "bodyweight"
          ? "bw"
          : isBodyweightUnit(s.unit)
            ? "lb"
            : s.unit || "lb",
      completed: false,
    };
  });
}

/** Draft fields are text so a half-typed value survives; empty means "not recorded". */
function num(raw: string): number | null {
  return raw.trim() === "" ? null : Number(raw);
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
  measure: ExerciseMeasure,
): boolean {
  if (tracksTime(measure) && set.duration.trim() !== "") return true;
  // A load with no hold is not a logged carry, so weight alone never counts here.
  if (!tracksReps(measure)) return false;

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
  const groupIds = new Set(draft.groups.map((g) => g.id));

  const blocks = draft.exercises
    .map((block) => {
      const name = block.exerciseName.trim();
      const known = catalog.find((e) => e.id === block.exerciseId || e.name === name);
      const equipment = normaliseEquipment(block.equipment);
      const measure = normaliseMeasure(block.measure);
      const unilateral = effectiveUnilateral(equipment, block.unilateral);
      const bodyweight = equipment === "bodyweight";
      const grouped = block.groupId !== null && groupIds.has(block.groupId);

      const filled = block.sets.map((s) =>
        setIsFilled(s, equipment, block.unilateral, measure),
      );

      /*
       * Ungrouped, a blank row is just an unused row and drops out. Inside a group the set
       * index *is* the round, so only the trailing blanks may go: dropping an interior one
       * would slide every later set onto the wrong round. A kept blank is a round this
       * member sat out, recorded as `completed: false` so history labels skip it.
       */
      const keep = grouped
        ? filled.map((_, i) => filled.slice(i).some(Boolean))
        : filled;

      // Each axis decides its own fields; nesting them produced a dozen near-copies.
      const sets = block.sets
        .map((s) => ({
          reps: tracksReps(measure) && !unilateral ? num(s.reps) : null,
          repsLeft: tracksReps(measure) && unilateral ? num(s.repsLeft) : null,
          repsRight: tracksReps(measure) && unilateral ? num(s.repsRight) : null,
          durationSeconds: tracksTime(measure)
            ? parseDurationSeconds(s.duration)
            : null,
          weight: bodyweight ? null : num(s.weight),
          unit: bodyweight ? "bw" : s.unit || "lb",
          completed: s.completed === true,
        }))
        .filter((_, i) => keep[i]);

      if (sets.length === 0) return null;
      if (!known?.id && !name) return null;

      return {
        exerciseId: known?.id || block.exerciseId || undefined,
        exerciseName: name || known?.name,
        notes: block.notes,
        groupId: grouped ? block.groupId : null,
        sets,
      };
    })
    .filter((block): block is NonNullable<typeof block> => block !== null);

  if (blocks.length === 0) return null;

  /*
   * A group whose every member lost its sets is gone, so the survivors have to be reindexed
   * — leave the gap and `groupIndex` quietly points at a different group.
   */
  const surviving = draft.groups.filter((g) => blocks.some((b) => b.groupId === g.id));
  const indexById = new Map(surviving.map((g, i) => [g.id, i]));

  return {
    performedAt: parseLocalInput(draft.performedAt),
    title: draft.title,
    notes: draft.notes,
    durationMinutes:
      draft.durationMinutes.trim() === "" ? null : Number(draft.durationMinutes),
    groups: surviving.map((g) => ({
      label: g.label.trim(),
      restSeconds: parseDurationSeconds(g.rest),
    })),
    exercises: blocks.map(({ groupId, ...block }) => ({
      ...block,
      groupIndex: groupId === null ? null : (indexById.get(groupId) ?? null),
    })),
  };
}

/** Seed a draft block from a catalog exercise. */
export function draftBlockFromCatalog(
  exercise: ExerciseSummary,
  key = crypto.randomUUID(),
): DraftExercise {
  return {
    key,
    groupId: null,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    equipment: exercise.equipment,
    measure: exercise.measure,
    barWeight: exercise.barWeight,
    unilateral: exercise.unilateral,
    notes: "",
    sets: [emptySetForExercise(exercise)],
  };
}

export function emptyDraftBlock(): DraftExercise {
  return {
    key: crypto.randomUUID(),
    groupId: null,
    exerciseId: "",
    exerciseName: "",
    equipment: "barbell",
    measure: "reps",
    barWeight: DEFAULT_BAR_WEIGHT_LB,
    unilateral: false,
    notes: "",
    sets: [emptyBilateralSet("lb")],
  };
}

export function toLocalDateTimeInput(date: Date): string {
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Reopen an existing session: keep stored completion flags. */
export function draftFromDetail(
  detail: SessionDetail,
  catalog: ExerciseSummary[],
): SessionDraft {
  return {
    performedAt: toLocalDateTimeInput(detail.performedAt),
    title: detail.title,
    notes: detail.notes,
    durationMinutes:
      detail.durationMinutes == null ? "" : String(detail.durationMinutes),
    groups: detail.groups.map((g) => ({
      id: g.id,
      label: g.label,
      rest: g.restSeconds == null ? "" : String(g.restSeconds),
    })),
    exercises: detail.exercises.map((ex) => {
      const cat = catalog.find((c) => c.id === ex.exerciseId);
      const equipment = cat?.equipment ?? ex.equipment;
      const measure = cat?.measure ?? ex.measure;
      const unilateral = cat?.unilateral ?? ex.unilateral;
      const barWeight = cat?.barWeight ?? ex.barWeight;
      return {
        key: ex.id,
        groupId: ex.groupId,
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        equipment,
        measure,
        barWeight,
        unilateral,
        notes: ex.notes,
        sets: ex.sets.map((s) => ({
          reps: s.reps == null ? "" : String(s.reps),
          repsLeft: s.repsLeft == null ? "" : String(s.repsLeft),
          repsRight: s.repsRight == null ? "" : String(s.repsRight),
          duration: s.durationSeconds == null ? "" : String(s.durationSeconds),
          weight: s.weight == null ? "" : String(s.weight),
          unit:
            equipment === "bodyweight" ? "bw" : s.unit === "bw" ? "lb" : s.unit || "lb",
          completed: s.completed === true,
        })),
      };
    }),
  };
}

/**
 * Copy last time into a new live session: same plan, new identity, nothing checked.
 * Session notes and duration stay with the source day.
 */
export function planDraftFromDetail(detail: SessionDetail): SessionDraft {
  const groupIds = new Map(detail.groups.map((g) => [g.id, crypto.randomUUID()]));
  const source = draftFromDetail(detail, []);
  return {
    performedAt: toLocalDateTimeInput(new Date()),
    title: source.title,
    notes: "",
    durationMinutes: "",
    groups: source.groups.map((g) => ({
      ...g,
      id: groupIds.get(g.id) ?? crypto.randomUUID(),
    })),
    exercises: source.exercises.map((ex) => ({
      ...ex,
      key: crypto.randomUUID(),
      groupId: ex.groupId ? (groupIds.get(ex.groupId) ?? null) : null,
      sets: ex.sets.map((s) => ({ ...s, completed: false })),
    })),
  };
}

/**
 * True when the draft is more than the default empty block. Picking a title on an
 * empty draft copies last time; picking one after work has started only sets the string.
 */
export function draftHasWork(draft: SessionDraft): boolean {
  if (draft.notes.trim() !== "" || draft.durationMinutes.trim() !== "") return true;
  if (draft.groups.length > 0) return true;
  if (draft.exercises.length !== 1) return true;
  const block = draft.exercises[0];
  if (block.exerciseId.trim() !== "" || block.exerciseName.trim() !== "") return true;
  if (block.notes.trim() !== "") return true;
  if (block.sets.length !== 1) return true;
  const set = block.sets[0];
  return (
    set.completed ||
    set.reps.trim() !== "" ||
    set.repsLeft.trim() !== "" ||
    set.repsRight.trim() !== "" ||
    set.duration.trim() !== "" ||
    set.weight.trim() !== ""
  );
}

export { usesWeight, DEFAULT_BAR_WEIGHT_LB };
