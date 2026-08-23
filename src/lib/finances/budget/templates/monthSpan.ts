/**
 * Calendar-month distance between two month keys. String arithmetic, no Date.
 */

import { monthKeyOf, type MonthKey } from "../envelope";

export function monthsBetween(from: MonthKey, to: MonthKey): number {
  const a = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7));
  const b = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7));
  return b - a;
}

export function monthsUntilDate(fromMonth: MonthKey, dateKey: string): number {
  return monthsBetween(fromMonth, monthKeyOf(dateKey));
}
