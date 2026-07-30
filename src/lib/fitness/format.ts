import type { SetInput, WorkoutSetView } from "./types";

/**
 * Compact set list for history rows: "3×5 @ 185 lb" or "5, 5, 3 @ 185/185/195 lb".
 * Pure — easy to get subtly wrong when mixing equal vs varying weights.
 */
export function formatSetsLabel(
  sets: Array<Pick<WorkoutSetView, "reps" | "weight" | "unit" | "completed">>,
): string {
  const done = sets.filter((s) => s.completed !== false);
  if (done.length === 0) return "—";

  const units = [...new Set(done.map((s) => s.unit || "lb"))];
  const unit = units.length === 1 ? units[0] : null;

  const reps = done.map((s) => (s.reps == null ? "?" : String(s.reps)));
  const weights = done.map((s) =>
    s.weight == null
      ? null
      : Number.isInteger(s.weight)
        ? String(s.weight)
        : String(s.weight),
  );
  const allSameReps = reps.every((r) => r === reps[0]);
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

  if (allSameReps && reps[0] !== "?") {
    return `${done.length}×${reps[0]}${weightPart}`;
  }
  return `${reps.join(", ")}${weightPart}`;
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
  weight: string | null;
  unit: string;
  completed: boolean;
} {
  const weight = parseWeight(set.weight);
  return {
    reps: parseReps(set.reps),
    // numeric column wants a string for drizzle's numeric type
    weight: weight === null ? null : String(weight),
    unit: (set.unit && String(set.unit).trim()) || "lb",
    completed: set.completed !== false,
  };
}
