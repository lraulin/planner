/**
 * Barbell plate math for logging. Defaults are US gym gear (Olympic bar + American
 * plates in lb) because that's what Lee has. kg uses a metric set when unit is kg.
 * Bar mass is configurable (Olympic 45, EZ 15, training 35, or none).
 */

import { barWeightInUnit, DEFAULT_BAR_WEIGHT_LB } from "./bars";

/** Standard American iron, largest first. */
export const AMERICAN_PLATES_LB = [45, 35, 25, 10, 5, 2.5] as const;

/** Common metric change plates, largest first. */
export const METRIC_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

export const OLYMPIC_BAR_LB = 45;
export const OLYMPIC_BAR_KG = 20;

export type PlateCount = { plate: number; count: number };

export type PlateLoad = {
  /** Plates on one side, largest first (each entry is one physical plate). */
  perSide: number[];
  /** Collapsed counts for display: 2×45, 1×10, … */
  counts: PlateCount[];
  bar: number;
  total: number;
  /** Load we couldn't make exactly with available denominations (per bar total). */
  remainder: number;
  unit: string;
};

function platesForUnit(unit: string): {
  plates: readonly number[];
  unit: string;
} {
  if (unit === "kg") {
    return { plates: METRIC_PLATES_KG, unit: "kg" };
  }
  return { plates: AMERICAN_PLATES_LB, unit: "lb" };
}

/**
 * Greedy load: split remaining weight evenly across two sides after removing bar.
 *
 * `barWeightLb` is catalog bar mass in lb (`0` = no plate calc — dumbbells).
 * When `barWeight` is passed it overrides and is already in the set's unit.
 */
export function calculatePlates(
  totalWeight: number,
  unit = "lb",
  barWeightLb: number = DEFAULT_BAR_WEIGHT_LB,
): PlateLoad | null {
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return null;
  // No bar / dumbbells — plate math doesn't apply.
  if (barWeightLb <= 0) return null;

  const kit = platesForUnit(unit);
  const bar = barWeightInUnit(barWeightLb, kit.unit);
  if (totalWeight <= bar) {
    return {
      perSide: [],
      counts: [],
      bar,
      total: totalWeight,
      remainder: Math.max(0, totalWeight - bar),
      unit: kit.unit,
    };
  }

  const loadable = totalWeight - bar;
  // Work in tenths to avoid 2.5 float noise. Leftover tenths × 2 = bar total shortfall.
  let remainingTenths = Math.round((loadable / 2) * 10);
  const perSide: number[] = [];

  for (const plate of kit.plates) {
    const plateTenths = Math.round(plate * 10);
    while (remainingTenths >= plateTenths) {
      perSide.push(plate);
      remainingTenths -= plateTenths;
    }
  }

  const totalRemainder = Math.round(remainingTenths * 2) / 10;

  return {
    perSide,
    counts: collapseCounts(perSide),
    bar,
    total: totalWeight,
    remainder: totalRemainder,
    unit: kit.unit,
  };
}

function collapseCounts(perSide: number[]): PlateCount[] {
  const map = new Map<number, number>();
  for (const plate of perSide) {
    map.set(plate, (map.get(plate) ?? 0) + 1);
  }
  return [...map.entries()].map(([plate, count]) => ({ plate, count }));
}

/**
 * Human plate string: "2×45 + 10 + 5 per side" or "bar only (45 lb)".
 * Empty when there's nothing useful to show.
 */
export function formatPlateLoad(load: PlateLoad | null): string | null {
  if (!load) return null;

  if (load.perSide.length === 0) {
    if (load.total <= load.bar && load.remainder === 0) {
      return `bar only (${load.bar} ${load.unit})`;
    }
    return null;
  }

  const parts = load.counts.map(({ plate, count }) =>
    count > 1 ? `${count}×${formatPlate(plate)}` : formatPlate(plate),
  );
  let text = `${parts.join(" + ")} per side`;
  if (load.remainder > 0) {
    text += ` (+${formatPlate(load.remainder)} ${load.unit} short)`;
  }
  return text;
}

function formatPlate(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

/** Convenience: total + bar → display string, or null. */
export function plateHint(
  totalWeight: number | null | undefined,
  unit: string,
  barWeightLb: number = DEFAULT_BAR_WEIGHT_LB,
): string | null {
  if (totalWeight == null || !Number.isFinite(totalWeight)) return null;
  return formatPlateLoad(calculatePlates(totalWeight, unit, barWeightLb));
}
