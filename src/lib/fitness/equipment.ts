import { BAR_PRESETS, DEFAULT_BAR_WEIGHT_LB, parseBarWeight } from "./bars";
import type { ExerciseEquipment } from "./types";

export const EQUIPMENT_OPTIONS: Array<{
  value: ExerciseEquipment;
  label: string;
}> = [
  { value: "barbell", label: "Barbell" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "club", label: "Club" },
  { value: "mace", label: "Mace" },
  { value: "bodyweight", label: "Bodyweight" },
];

const EQUIPMENT_LABEL: Record<ExerciseEquipment, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  kettlebell: "Kettlebell",
  club: "Club",
  mace: "Mace",
  bodyweight: "Bodyweight",
};

export function isExerciseEquipment(value: string): value is ExerciseEquipment {
  return (
    value === "barbell" ||
    value === "dumbbell" ||
    value === "kettlebell" ||
    value === "club" ||
    value === "mace" ||
    value === "bodyweight"
  );
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

/** Free weights and barbells log a load; bodyweight does not. */
export function usesWeight(equipment: ExerciseEquipment): boolean {
  return (
    equipment === "barbell" ||
    equipment === "dumbbell" ||
    equipment === "kettlebell" ||
    equipment === "club" ||
    equipment === "mace"
  );
}

/**
 * Unilateral L/R valid for handheld free weights and bodyweight
 * (clubs/maces/KBs often train one side at a time).
 */
export function allowsUnilateral(equipment: ExerciseEquipment): boolean {
  return (
    equipment === "dumbbell" ||
    equipment === "kettlebell" ||
    equipment === "club" ||
    equipment === "mace" ||
    equipment === "bodyweight"
  );
}

export function effectiveUnilateral(
  equipment: ExerciseEquipment,
  unilateral: boolean,
): boolean {
  return allowsUnilateral(equipment) && unilateral;
}

function formatSimpleEquipment(
  equipment: Exclude<ExerciseEquipment, "barbell">,
  unilateral: boolean,
  style: "short" | "badge",
): string {
  const base = EQUIPMENT_LABEL[equipment];
  if (!effectiveUnilateral(equipment, unilateral)) return base;
  return style === "short" ? `${base} L/R` : `${base} · L/R`;
}

function formatBarbellShort(barWeightLb: number): string {
  const bar = parseBarWeight(barWeightLb);
  const preset = BAR_PRESETS.find((p) => p.weight === bar && p.id !== "none");
  if (preset?.id === "ez") return "Barbell · EZ 15";
  if (preset?.id === "training") return "Barbell · Training 35";
  if (preset?.id === "olympic" || bar === DEFAULT_BAR_WEIGHT_LB) {
    return "Barbell";
  }
  return `Barbell · ${bar} lb`;
}

function formatBarbellBadge(barWeightLb: number): string {
  const bar = parseBarWeight(barWeightLb);
  const preset = BAR_PRESETS.find((p) => p.weight === bar && p.id !== "none");
  if (preset?.id === "olympic") return "Barbell · Olympic 45";
  if (preset?.id === "ez") return "Barbell · EZ 15";
  if (preset?.id === "training") return "Barbell · Training 35";
  if (bar === DEFAULT_BAR_WEIGHT_LB) return "Barbell · Olympic 45";
  return `Barbell · ${bar} lb`;
}

/** Short equipment tag for the picker — no need to put "Dumbbell" in the exercise name. */
export function formatEquipmentShort(
  equipment: ExerciseEquipment,
  barWeightLb: number,
  unilateral: boolean,
): string {
  if (equipment === "barbell") return formatBarbellShort(barWeightLb);
  return formatSimpleEquipment(equipment, unilateral, "short");
}

/**
 * Compact badge for catalog list / session hint.
 * e.g. "Barbell · EZ 15", "Dumbbell · L/R", "Club", "Mace · L/R", "Bodyweight".
 */
export function formatEquipmentBadge(
  equipment: ExerciseEquipment,
  barWeightLb: number,
  unilateral: boolean,
): string {
  if (equipment === "barbell") return formatBarbellBadge(barWeightLb);
  return formatSimpleEquipment(equipment, unilateral, "badge");
}

/**
 * Option text in the session log picker: "Curl · Dumbbell", "Curl · Barbell · EZ 15".
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
