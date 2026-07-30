import type { SetInput, WorkoutSetView } from "./types";

/** Stored as set.unit — no weight column, no "0 lb" shame. */
export function isBodyweightUnit(unit: string | null | undefined): boolean {
  const u = (unit ?? "").trim().toLowerCase();
  return u === "bw" || u === "bodyweight" || u === "body weight";
}

function isUnilateralSet(
  s: Pick<WorkoutSetView, "reps" | "repsLeft" | "repsRight">,
): boolean {
  return s.repsLeft != null || s.repsRight != null;
}

/** One set's reps token: "5" or "8/6" (L/R). */
export function formatSetRepsToken(
  s: Pick<WorkoutSetView, "reps" | "repsLeft" | "repsRight">,
): string {
  if (isUnilateralSet(s)) {
    const L = s.repsLeft == null ? "?" : String(s.repsLeft);
    const R = s.repsRight == null ? "?" : String(s.repsRight);
    return `${L}/${R}`;
  }
  return s.reps == null ? "?" : String(s.reps);
}

/**
 * Compact set list for history rows:
 * - bilateral: "3×5 @ 185 lb", "5, 3 @ 185/195 lb", "3×8 BW"
 * - unilateral L/R: "3×8/6 @ 50 lb", "10/8, 8/6 BW"
 */
export function formatSetsLabel(
  sets: Array<
    Pick<
      WorkoutSetView,
      "reps" | "repsLeft" | "repsRight" | "weight" | "unit" | "completed"
    >
  >,
): string {
  const done = sets.filter((s) => s.completed !== false);
  if (done.length === 0) return "—";

  const units = [...new Set(done.map((s) => s.unit || "lb"))];
  const unit = units.length === 1 ? units[0] : null;
  const bodyweight =
    (unit !== null && isBodyweightUnit(unit)) ||
    done.every((s) => isBodyweightUnit(s.unit));

  const repTokens = done.map(formatSetRepsToken);
  const allSameReps = repTokens.every((r) => r === repTokens[0]);

  if (bodyweight) {
    if (allSameReps && repTokens[0] !== "?") {
      return `${done.length}×${repTokens[0]} BW`;
    }
    return `${repTokens.join(", ")} BW`;
  }

  const weights = done.map((s) =>
    s.weight == null
      ? null
      : Number.isInteger(s.weight)
        ? String(s.weight)
        : String(s.weight),
  );
  const allSameWeight = weights.every((w) => w === weights[0]) && weights[0] !== null;

  const weightPart = (() => {
    if (weights.every((w) => w === null)) return "";
    if (allSameWeight) return ` @ ${weights[0]}${unit ? ` ${unit}` : ""}`;
    const mixed = weights.map((w, i) => {
      const u = unit ?? (done[i].unit || "lb");
      return w == null ? `— ${u}` : `${w}${unit ? "" : ` ${u}`}`;
    });
    return ` @ ${mixed.join("/")}${unit ? ` ${unit}` : ""}`;
  })();

  if (allSameReps && repTokens[0] !== "?") {
    return `${done.length}×${repTokens[0]}${weightPart}`;
  }
  return `${repTokens.join(", ")}${weightPart}`;
}

/** Normalise free-typed weight input; empty/invalid → null. */
export function parseWeight(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n =
    typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function parseReps(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

export function normaliseSetInput(set: SetInput): {
  reps: number | null;
  repsLeft: number | null;
  repsRight: number | null;
  weight: string | null;
  unit: string;
  completed: boolean;
} {
  const unit = (set.unit && String(set.unit).trim()) || "lb";
  const repsLeft = parseReps(set.repsLeft);
  const repsRight = parseReps(set.repsRight);
  const unilateral = repsLeft != null || repsRight != null;

  if (isBodyweightUnit(unit)) {
    return {
      reps: unilateral ? null : parseReps(set.reps),
      repsLeft: unilateral ? repsLeft : null,
      repsRight: unilateral ? repsRight : null,
      weight: null,
      unit: "bw",
      completed: set.completed !== false,
    };
  }

  const weight = parseWeight(set.weight);
  return {
    reps: unilateral ? null : parseReps(set.reps),
    repsLeft: unilateral ? repsLeft : null,
    repsRight: unilateral ? repsRight : null,
    weight: weight === null ? null : String(weight),
    unit,
    completed: set.completed !== false,
  };
}
