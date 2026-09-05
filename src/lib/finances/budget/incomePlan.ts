import type { BudgetCategoryRow } from "./queries";
import type { BudgetRow } from "./rows";
import type { BudgetMonth, MonthKey } from "./envelope";
import { assignBillsFromRows, assignEnvelopeFromRow } from "./assign/fromBudget";
import { neededAssigned } from "./assign/plan";

export function regularIncomePlan(
  categories: readonly Pick<
    BudgetCategoryRow,
    "id" | "name" | "kind" | "incomeRole" | "expectedMonthlyIncomeCents"
  >[],
) {
  const regular = categories.filter(
    (row) => row.kind === "income" && row.incomeRole === "regular",
  );
  const missing = regular.filter((row) => row.expectedMonthlyIncomeCents === null);
  const knownCents = regular.reduce(
    (sum, row) => sum + (row.expectedMonthlyIncomeCents ?? 0),
    0,
  );
  return {
    knownCents,
    expectedCents: regular.length > 0 && missing.length === 0 ? knownCents : null,
    missing,
    noRegularIncome: regular.length === 0,
  };
}

/** Planning calls the same requirement as Assign, and never writes an allocation. */
export function monthlyFundingPlan(
  rows: readonly BudgetRow[],
  month: MonthKey,
  previous: BudgetMonth | null,
) {
  const income = regularIncomePlan(rows);
  const bills = assignBillsFromRows(rows);
  const missing: { id: string; name: string; reason: string }[] = [];
  let plannedCents = 0;
  for (const row of rows) {
    if (row.kind !== "spending" && row.kind !== "bill") continue;
    if (row.bill && row.bill.status !== "active") {
      plannedCents += Math.max(0, row.assignedCents);
      continue;
    }
    const requirement = neededAssigned(
      assignEnvelopeFromRow(row, previous),
      month,
      bills,
    );
    plannedCents += Math.max(0, row.assignedCents, requirement.needed);
    if (row.kind === "spending" && !row.target)
      missing.push({ id: row.id, name: row.name, reason: "No target" });
    if (row.bill?.expectedCents === null)
      missing.push({ id: row.id, name: row.name, reason: "No bill amount" });
    for (const reason of requirement.errors)
      missing.push({ id: row.id, name: row.name, reason });
  }
  return {
    income,
    plannedCents,
    missing,
    marginCents:
      income.expectedCents === null || missing.length > 0
        ? null
        : income.expectedCents - plannedCents,
  };
}
