import type { BudgetCategoryRow } from "@/lib/finances/budget/queries";

/** A visible spending envelope named and sorted by its id, ungrouped unless `overrides` say. */
export function budgetCategoryRow(
  id: string,
  overrides: Partial<BudgetCategoryRow> = {},
): BudgetCategoryRow {
  const kind = overrides.kind ?? "spending";
  return {
    id,
    groupId: null,
    name: id,
    sortKey: id,
    hidden: false,
    notes: "",
    target: null,
    kind,
    incomeRole: "other",
    expectedMonthlyIncomeCents: null,
    isIncome: kind === "income",
    bill: null,
    ...overrides,
  };
}
