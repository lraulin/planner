import type { SupplyRate } from "./cost";
import { daysPerUnit, unitsPerDay } from "./cost";

/**
 * Display strings for the worksheet. Separate from `src/lib/finances/money.ts` because
 * these break its central rule on purpose: a unit cost is shown to four decimal places.
 */

/**
 * `$0.9279`. Four places, always — this is the column where two rounded cents is the whole
 * difference between two vendors, and `$0.93` against `$0.93` says nothing.
 */
export function formatUnitCost(cents: number): string {
  const negative = cents < 0;
  return `${negative ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(4)}`;
}

/**
 * How fast this gets used, stated from the end the user typed it from.
 *
 * The other end is shown greyed beside it by the grid, so this deliberately does not try to
 * say both in one string.
 */
export function formatRate(rate: SupplyRate, unitLabel: string): string {
  const unit = unitLabel.trim() || "unit";
  if (rate.basis === "units_per_day") {
    const perDay = unitsPerDay(rate);
    return `${trimNumber(perDay)} ${unit}${perDay === 1 ? "" : "s"}/day`;
  }
  return `1 ${unit} lasts ${trimNumber(daysPerUnit(rate))} days`;
}

/** The derived other end, for the greyed hint. */
export function formatDerivedRate(rate: SupplyRate, unitLabel: string): string {
  const unit = unitLabel.trim() || "unit";
  if (rate.basis === "units_per_day") {
    return `≈ ${trimNumber(daysPerUnit(rate))} days per ${unit}`;
  }
  return `≈ ${trimNumber(unitsPerDay(rate))} ${unit}/day`;
}

/** `+7.7%` / `−7.7%`. Signed, because the sign is the answer. */
export function formatDeltaPercent(percent: number): string {
  if (!Number.isFinite(percent) || percent === 0) return "—";
  const sign = percent > 0 ? "+" : "−";
  return `${sign}${Math.abs(percent).toFixed(1)}%`;
}

/** Up to three decimals, with none of the trailing zeroes that make a column ragged. */
export function trimNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Number(value.toFixed(3)));
}
