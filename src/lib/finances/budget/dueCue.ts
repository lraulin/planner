import { monthKeyOf } from "./envelope";
import type { IndicatorState } from "./indicator";
import type { BudgetRow } from "./rows";
import { shiftDateKey } from "@/lib/schedule/geometry";

/**
 * The cue is urgent only while the envelope still needs money. A funded bill that lands
 * before payday is worth seeing — it says "leave this money alone" — but it is not a
 * warning, because it has already been addressed.
 */
export type BillDueCue = { label: string; hint: string; urgent: boolean };

export function billDueCue(
  row: Pick<BudgetRow, "bill" | "nextDueKey">,
  month: string,
  today: string,
  payday: string | null,
  state: IndicatorState,
): BillDueCue | null {
  if (
    month !== monthKeyOf(today) ||
    !payday ||
    !row.nextDueKey ||
    row.bill?.status !== "active" ||
    !row.bill.scheduled
  )
    return null;
  if (row.nextDueKey < today) return null;
  const label =
    row.nextDueKey < payday
      ? "Before payday"
      : row.nextDueKey === payday
        ? "On payday"
        : null;
  if (!label) return null;
  // Both states mean the envelope cannot cover what the month already asked of it, which
  // is the only reason a date this side of payday needs to shout.
  const urgent = state === "underfunded" || state === "overspent";
  const when =
    row.nextDueKey < payday ? "before your next payday" : "on your next payday";
  return {
    label,
    hint: urgent
      ? `Charges ${when}, and this envelope still needs money`
      : `Charges ${when} — already funded, so leave this money here`,
    urgent,
  };
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
