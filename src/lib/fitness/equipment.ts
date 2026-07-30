import { BAR_PRESETS, DEFAULT_BAR_WEIGHT_LB, parseBarWeight } from "./bars";
import type { ExerciseEquipment } from "./types";

export const EQUIPMENT_OPTIONS: Array<{
  value: ExerciseEquipment;
  label: string;
}> = [
  { value: "barbell", label: "Barbell" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "bodyweight", label: "Bodyweight" },
];

export function isExerciseEquipment(value: string): value is ExerciseEquipment {
  return value === "barbell" || value === "dumbbell" || value === "bodyweight";
}

export function normaliseEquipment(
  value: string | null | undefined,
): ExerciseEquipment {
  if (value && isExerciseEquipment(value)) return value;
  return "barbell";
}

/** Plate math only for loaded barbells. */
export function usesPlateCalculator(equipment: ExerciseEquipment): boolean {
  return equipment === "barbell";
}

export function usesWeight(equipment: ExerciseEquipment): boolean {
  return equipment === "barbell" || equipment === "dumbbell";
}

/** Unilateral L/R only valid for dumbbell or bodyweight. */
export function allowsUnilateral(equipment: ExerciseEquipment): boolean {
  return equipment === "dumbbell" || equipment === "bodyweight";
}

export function effectiveUnilateral(
  equipment: ExerciseEquipment,
  unilateral: boolean,
): boolean {
  return allowsUnilateral(equipment) && unilateral;
}

/** Short equipment tag for dropdowns — no need to put "Dumbbell" in the exercise name. */
export function formatEquipmentShort(
  equipment: ExerciseEquipment,
  barWeightLb: number,
  unilateral: boolean,
): string {
  if (equipment === "bodyweight") {
    return effectiveUnilateral(equipment, unilateral) ? "Bodyweight L/R" : "Bodyweight";
  }
  if (equipment === "dumbbell") {
    return effectiveUnilateral(equipment, unilateral) ? "Dumbbell L/R" : "Dumbbell";
  }
  const bar = parseBarWeight(barWeightLb);
  const preset = BAR_PRESETS.find((p) => p.weight === bar && p.id !== "none");
  if (preset?.id === "ez") return "Barbell · EZ 15";
  if (preset?.id === "training") return "Barbell · Training 35";
  if (preset?.id === "olympic" || bar === DEFAULT_BAR_WEIGHT_LB) {
    return "Barbell";
  }
  return `Barbell · ${bar} lb`;
}

/**
 * Compact badge for catalog list / session hint.
 * e.g. "Barbell · EZ 15", "Dumbbell · L/R", "Bodyweight".
 */
export function formatEquipmentBadge(
  equipment: ExerciseEquipment,
  barWeightLb: number,
  unilateral: boolean,
): string {
  if (equipment === "bodyweight") {
    return effectiveUnilateral(equipment, unilateral)
      ? "Bodyweight · L/R"
      : "Bodyweight";
  }
  if (equipment === "dumbbell") {
    return effectiveUnilateral(equipment, unilateral) ? "Dumbbell · L/R" : "Dumbbell";
  }
  const bar = parseBarWeight(barWeightLb);
  const preset = BAR_PRESETS.find((p) => p.weight === bar && p.id !== "none");
  if (preset?.id === "olympic") return "Barbell · Olympic 45";
  if (preset?.id === "ez") return "Barbell · EZ 15";
  if (preset?.id === "training") return "Barbell · Training 35";
  if (bar === DEFAULT_BAR_WEIGHT_LB) return "Barbell · Olympic 45";
  return `Barbell · ${bar} lb`;
}

/**
 * Option text in the session log select: "Curl · Dumbbell", "Curl · Barbell · EZ 15".
 * Name stays clean; equipment disambiguates barbell vs dumbbell variants.
 */
export function formatExerciseSelectLabel(
  name: string,
  equipment: ExerciseEquipment,
  barWeightLb: number,
  unilateral: boolean,
): string {
  const label = name.trim() || "Untitled";
  return `${label} · ${formatEquipmentShort(equipment, barWeightLb, unilateral)}`;
}

/** Sentinel value for the session exercise &lt;select&gt; “Add new…” option. */
export const NEW_EXERCISE_SELECT_VALUE = "__new_exercise__";

/** Defaults when creating a new catalog exercise. */
export function defaultExercisePrefs(): {
  equipment: ExerciseEquipment;
  barWeight: number;
  unilateral: boolean;
} {
  return {
    equipment: "barbell",
    barWeight: DEFAULT_BAR_WEIGHT_LB,
    unilateral: false,
  };
}

/**
 * Coerce prefs after equipment change: clear unilateral when invalid; keep bar
 * for barbell (default 45 if was 0).
 */
export function coerceExercisePrefs(input: {
  equipment: ExerciseEquipment;
  barWeight: number;
  unilateral: boolean;
}): {
  equipment: ExerciseEquipment;
  barWeight: number;
  unilateral: boolean;
} {
  const equipment = normaliseEquipment(input.equipment);
  let barWeight = parseBarWeight(input.barWeight);
  if (equipment === "barbell" && barWeight <= 0) {
    barWeight = DEFAULT_BAR_WEIGHT_LB;
  }
  const unilateral = effectiveUnilateral(equipment, input.unilateral);
  return { equipment, barWeight, unilateral };
}
