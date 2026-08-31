import { formatDurationToken, parseDurationSeconds } from "./duration";
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
 * What one set did: reps ("5", "8/6"), a hold ("45s", "1:30"), or reps then a hold
 * ("10 + 20s"). Read off the row's own nulls rather than the catalog `measure`, so the
 * label renders correctly for a set logged before the exercise was reconfigured.
 */
export function formatSetMeasureToken(
  s: Pick<WorkoutSetView, "reps" | "repsLeft" | "repsRight" | "durationSeconds">,
): string {
  const hasReps = s.reps != null || isUnilateralSet(s);
  const hold =
    s.durationSeconds == null ? null : formatDurationToken(s.durationSeconds);

  if (hasReps && hold !== null) return `${formatSetRepsToken(s)} + ${hold}`;
  if (hold !== null) return hold;
  if (hasReps) return formatSetRepsToken(s);
  return "?";
}

/**
 * Compact set list for history rows:
 * - bilateral: "3×5 @ 185 lb", "5, 3 @ 185/195 lb", "3×8 BW"
 * - unilateral L/R: "3×8/6 @ 50 lb", "10/8, 8/6 BW"
 * - timed: "3×45s BW", "3×1:30 @ 50 lb"
 * - reps then hold: "3×10 + 20s BW"
 */
export function formatSetsLabel(
  sets: Array<
    Pick<
      WorkoutSetView,
      | "reps"
      | "repsLeft"
      | "repsRight"
      | "durationSeconds"
      | "weight"
      | "unit"
      | "completed"
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

  const tokens = done.map(formatSetMeasureToken);
  const allSame = tokens.every((t) => t === tokens[0]);

  if (bodyweight) {
    if (allSame && tokens[0] !== "?") {
      return `${done.length}×${tokens[0]} BW`;
    }
    return `${tokens.join(", ")} BW`;
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

  if (allSame && tokens[0] !== "?") {
    return `${done.length}×${tokens[0]}${weightPart}`;
  }
  return `${tokens.join(", ")}${weightPart}`;
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
  durationSeconds: number | null;
  weight: string | null;
  unit: string;
  completed: boolean;
} {
  const unit = (set.unit && String(set.unit).trim()) || "lb";
  const repsLeft = parseReps(set.repsLeft);
  const repsRight = parseReps(set.repsRight);
  const unilateral = repsLeft != null || repsRight != null;
  // Independent of reps: a reps-then-hold set carries both.
  const durationSeconds = parseDurationSeconds(set.durationSeconds);
  const bodyweight = isBodyweightUnit(unit);
  const weight = bodyweight ? null : parseWeight(set.weight);

  return {
    reps: unilateral ? null : parseReps(set.reps),
    repsLeft: unilateral ? repsLeft : null,
    repsRight: unilateral ? repsRight : null,
    durationSeconds,
    weight: weight === null ? null : String(weight),
    unit: bodyweight ? "bw" : unit,
    // Omitted must not mean done — that was the “copied workout looks finished” bug.
    completed: set.completed === true,
  };
}
