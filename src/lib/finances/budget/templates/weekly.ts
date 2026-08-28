/**
 * Weekly templates — an amount anchored to a weekday, times the occurrences this month.
 *
 * **Reimplemented from Actual Budget** — `runPeriodic` in
 * `packages/loot-core/src/server/budget/category-template-context.ts` (MIT, © James Long).
 * We keep their semantics (occurrences inside the month × amount, carry-in never consulted)
 * and drop their cadence surface: no `period` unit, no `starting` date, no per-line `limit`
 * (spec D4). Actual walks an anchor date forward; a weekday count is closed form, so this
 * computes rather than loops.
 *
 * Spec: `agent-os/specs/2026-08-27-1949-weekly-envelope-targets/` D1–D3.
 */

import { weekdayOfDateKey } from "@/lib/schedule/geometry";
import { monthEndKey, type MonthKey } from "../envelope";
import { assertCents, type WeeklyTemplate } from "./types";

/**
 * How many times `weekday` (0 = Sunday) falls inside the calendar month.
 *
 * The weekday of the 1st comes from `weekdayOfDateKey`, which reads the UTC-noon encoding —
 * `new Date(key).getDay()` reports Saturday evening for a Sunday in the Americas
 * (`standards/development/dates.md`).
 */
export function countWeekdayInMonth(month: MonthKey, weekday: number): number {
  const firstWeekday = weekdayOfDateKey(month);
  const days = Number(monthEndKey(month).slice(8, 10));
  /** Days from the 1st to the month's first matching weekday. */
  const offset = (weekday - firstWeekday + 7) % 7;
  if (offset >= days) return 0;
  return Math.floor((days - 1 - offset) / 7) + 1;
}

/**
 * What one weekly line wants assigned this month.
 *
 * Every occurrence in the month, not only the ones still ahead of today (D2), and carry-in is
 * not a parameter at all: skipping one week does not make the next week cheaper, it leaves
 * spare cash to move elsewhere (D3).
 */
export function runWeekly(template: WeeklyTemplate, month: MonthKey): number {
  const amount = assertCents(template.amountCents, "weekly amount");
  return amount * countWeekdayInMonth(month, template.weekday);
}
