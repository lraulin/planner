import { parseWeight } from "./format";

/**
 * Step size for +/- weight buttons. 5 lb is a standard American plate pair (2.5 per
 * side). kg uses 2.5 — half a common small plate, ~5.5 lb, close enough when you mostly
 * live in lb with US iron.
 */
export function weightStep(unit: string): number {
  if (unit === "kg") return 2.5;
  return 5;
}

function formatStepped(n: number): string {
  // Avoid "7.5000001" from float math on 2.5 kg steps.
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/**
 * Bump a free-typed weight string by one plate step. Empty + up starts at one step
 * (not the bar — dumbbells and machines are fine too). Down past zero clears the field.
 */
export function bumpWeight(current: string, unit: string, direction: 1 | -1): string {
  const step = weightStep(unit);
  const base = parseWeight(current);

  if (base === null) {
    return direction > 0 ? formatStepped(step) : "";
  }

  const next = base + direction * step;
  if (next <= 0) return "";
  return formatStepped(next);
}
