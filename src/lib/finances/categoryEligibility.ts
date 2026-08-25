export type CategoryEligibilityRow = {
  id: string;
  accountId: string;
  transactionDate: string;
  transferGroupId: string | null;
  effectiveFlow: string;
};

/**
 * Rows whose Category may be edited.
 *
 * This deliberately has no budget-start bound: pre-start Categories are analysis history.
 * Off-budget rows never use an envelope, and an internal transfer wholly inside the budget
 * moves no money between Categories. The on-budget leg of a transfer across the budget
 * boundary remains assignable because that leg is real money entering or leaving the budget.
 */
export function categoryAssignableIds(
  rows: readonly CategoryEligibilityRow[],
  offBudgetAccountIds: ReadonlySet<string>,
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

export function categoryAssignmentRefusal(input: {
  accountOffBudget: boolean;
  categoryAssignable: boolean;
}): string | null {
  if (input.accountOffBudget) {
    return "This account is outside the envelope budget.";
  }
  if (!input.categoryAssignable) {
    return "Transfers between on-budget accounts do not use a Category.";
  }
  return null;
}

export type CategoryAssignmentSkip = { id: string; reason: string };

/**
 * Split a bulk Category write into rows we can update and rows we skip.
 *
 * Ids that did not load (another user's, or gone) are omitted from both lists so
 * we do not advertise their existence.
 */
export function partitionCategoryTargets(
  requestedIds: readonly string[],
  loaded: readonly {
    id: string;
    accountOffBudget: boolean;
    categoryAssignable: boolean;
  }[],
): { assignable: string[]; skipped: CategoryAssignmentSkip[] } {
  const byId = new Map(loaded.map((row) => [row.id, row]));
  const assignable: string[] = [];
  const skipped: CategoryAssignmentSkip[] = [];
  for (const id of requestedIds) {
    const row = byId.get(id);
    if (!row) continue;
    const reason = categoryAssignmentRefusal(row);
    if (reason) skipped.push({ id, reason });
    else assignable.push(id);
  }
  return { assignable, skipped };
}

/** The exact rows Actual's Category backlog can act on. */
export function categoryEligibleIds(
  rows: readonly CategoryEligibilityRow[],
  offBudgetAccountIds: ReadonlySet<string>,
  budgetStartMonth: string | null,
): Set<string> {
  const assignable = categoryAssignableIds(rows, offBudgetAccountIds);
  return new Set(
    rows.flatMap((row) => {
      if (!budgetStartMonth || row.transactionDate < budgetStartMonth) return [];
      if (!assignable.has(row.id)) return [];
      return [row.id];
    }),
  );
}
