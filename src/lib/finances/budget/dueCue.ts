import { monthKeyOf } from "./envelope";
import type { BudgetRow } from "./rows";
import { shiftDateKey } from "@/lib/schedule/geometry";

export function billDueCue(
  row: Pick<BudgetRow, "bill" | "nextDueKey">,
  month: string,
  today: string,
  payday: string | null,
): string | null {
  if (
    month !== monthKeyOf(today) ||
    !payday ||
    !row.nextDueKey ||
    row.bill?.status !== "active" ||
    !row.bill.scheduled
  )
    return null;
  if (row.nextDueKey < today) return null;
  return row.nextDueKey < payday
    ? "Before payday"
    : row.nextDueKey === payday
      ? "On payday"
      : null;
}

export function billDueSoon(
  row: Pick<BudgetRow, "bill" | "nextDueKey">,
  today: string,
  horizonDays = 14,
): boolean {
  return (
    row.bill?.status === "active" &&
    row.bill.scheduled &&
    row.nextDueKey !== null &&
    row.nextDueKey >= today &&
    row.nextDueKey <= shiftDateKey(today, horizonDays)
  );
}
