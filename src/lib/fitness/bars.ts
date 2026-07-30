/**
 * Bar presets for plate math. Masses are stored and selected in **lb** (US gym gear).
 * `0` means no bar — dumbbells / machines / plate-loaded but skip the per-side calc.
 */

export type BarPresetId = "olympic" | "ez" | "training" | "none" | "custom";

export type BarPreset = {
  id: Exclude<BarPresetId, "custom">;
  label: string;
  /** lb */
  weight: number;
};

export const BAR_PRESETS: readonly BarPreset[] = [
  { id: "olympic", label: "Olympic (45 lb)", weight: 45 },
  { id: "ez", label: "EZ bar (15 lb)", weight: 15 },
  { id: "training", label: "Training (35 lb)", weight: 35 },
  { id: "none", label: "No bar / dumbbell", weight: 0 },
] as const;

export const DEFAULT_BAR_WEIGHT_LB = 45;

/** Match a stored bar weight to a preset, or `custom`. */
export function barPresetId(weightLb: number): BarPresetId {
  const match = BAR_PRESETS.find((p) => p.weight === weightLb);
  return match?.id ?? "custom";
}

export function parseBarWeight(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined || raw === "") return DEFAULT_BAR_WEIGHT_LB;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0) return DEFAULT_BAR_WEIGHT_LB;
  return n;
}

/**
 * Convert stored bar lb → the unit the set is logged in, for plate math.
 * Common US bars map to the usual gym kg bars; anything else is half-kg rounded.
 */
export function barWeightInUnit(barWeightLb: number, unit: string): number {
  if (unit === "kg") {
    if (barWeightLb === 45) return 20;
    if (barWeightLb === 35) return 15;
    if (barWeightLb === 15) return 7;
    return Math.round(barWeightLb * 0.45359237 * 2) / 2;
  }
  return barWeightLb;
}
