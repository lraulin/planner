import type { BudgetCategoryRow, BudgetGroupRow } from "./queries";

/** Reveal only the linked envelope's ancestry, keeping the persisted layout untouched. */
export function budgetReturnContext(
  id: string | null,
  categories: readonly BudgetCategoryRow[],
  groups: readonly BudgetGroupRow[],
) {
  const category = categories.find((row) => row.id === id);
  if (!category || category.kind === "income") return null;
  const byId = new Map(groups.map((row) => [row.id, row]));
  const ancestors = new Set<string>();
  let parent = category.groupId;
  while (parent !== null) {
    if (ancestors.has(parent)) throw new Error("Budget groups contain a cycle.");
    ancestors.add(parent);
    parent = byId.get(parent)?.parentGroupId ?? null;
  }
  return {
    id: category.id,
    table:
      category.kind === "bill"
        ? ("bills" as const)
        : category.kind === "savings"
          ? ("savings" as const)
          : ("envelopes" as const),
    ancestors,
  };
}
export function revealBudgetGroups(
  collapsed: ReadonlySet<string>,
  ancestors: ReadonlySet<string> | undefined,
): Set<string> {
  return new Set([...collapsed].filter((id) => !ancestors?.has(id)));
}
