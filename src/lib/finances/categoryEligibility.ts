export type CategoryEligibilityRow = {
  id: string;
  accountId: string;
  transactionDate: string;
  transferGroupId: string | null;
  effectiveFlow: string;
};

/** The exact rows Actual's Category backlog can act on. */
export function categoryEligibleIds(
  rows: readonly CategoryEligibilityRow[],
  offBudgetAccountIds: ReadonlySet<string>,
  budgetStartMonth: string | null,
): Set<string> {
  const groups = new Map<string, CategoryEligibilityRow[]>();
  for (const row of rows) {
    if (!row.transferGroupId) continue;
    const group = groups.get(row.transferGroupId);
    if (group) group.push(row);
    else groups.set(row.transferGroupId, [row]);
  }
  return new Set(
    rows.flatMap((row) => {
      if (!budgetStartMonth || row.transactionDate < budgetStartMonth) return [];
      if (offBudgetAccountIds.has(row.accountId)) return [];
      if (row.transferGroupId) {
        const other = groups
          .get(row.transferGroupId)
          ?.find((entry) => entry.id !== row.id);
        if (other && !offBudgetAccountIds.has(other.accountId)) return [];
      } else if (row.effectiveFlow === "internal_transfer") return [];
      return [row.id];
    }),
  );
}
