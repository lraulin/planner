import type { BudgetData } from "./budget/queries";
import { budgetRows, isBillRow, type BudgetBillRow } from "./budget/rows";
import { buildBudget, findMonth } from "./budget/envelope";
import { budgetEnvelopeLabel, nestedBudgetGridRows } from "./budget/hierarchy";
import type { GridRow } from "@/lib/tree/slice";

export function managementBillRows(
  data: BudgetData,
  anchors: {
    nextDueKeys: ReadonlyMap<string, string>;
    expectedKeys: ReadonlyMap<string, string>;
  },
) {
  const month =
    findMonth(data.months, data.month) ??
    buildBudget({
      categories: data.categories,
      allocations: [],
      activity: [],
      buffered: [],
      startMonth: data.month,
      endMonth: data.month,
      openingCents: 0,
    })[0];
  return budgetRows(
    data.groups,
    data.categories,
    month,
    data.goals,
    anchors.nextDueKeys,
    anchors.expectedKeys,
  ).filter(isBillRow);
}

export function billGroupLabel(
  data: Pick<BudgetData, "groups">,
  row: BudgetBillRow,
): string {
  return row.groupId === null
    ? "Ungrouped"
    : budgetEnvelopeLabel(data.groups, { groupId: row.groupId, name: "" }).replace(
        /\s*[›/]\s*$/,
        "",
      );
}

export function billsGridRows<T extends BudgetBillRow>(
  rows: readonly T[],
  data: Pick<BudgetData, "groups">,
  grouped: boolean,
): GridRow<T>[] {
  if (!grouped)
    return rows.map((node) => ({ kind: "node", id: node.id, node, depth: 0 }));
  return nestedBudgetGridRows(
    data.groups.filter((group) => group.kind === "bill"),
    rows,
    rows,
    { showHidden: true },
  );
}
