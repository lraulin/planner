/**
 * Budget Activity → Register drill-down: URL, empty copy, and the contributing set.
 *
 * The list is not "this envelope + this month" as ordinary chips. It is the same
 * predicates as `activitySince` so the rows sum to the figure that was clicked.
 * Spec: `agent-os/specs/2026-08-28-1356-budget-activity-register-links/`.
 */

import {
  customFilter,
  optionsFilter,
  type ColumnFilter,
} from "@/lib/grid/customFilter";
import { asRecordId } from "@/lib/url/viewState";
import { effectiveFlow } from "./analytics";
import {
  monthEndKey,
  monthKeyFromParam,
  monthKeyOf,
  monthLabel,
  monthParamOf,
  type MonthKey,
} from "./budget/envelope";
import { categoryAssignableIds } from "./categoryEligibility";
import type { TransactionListRow } from "./types";

export type ActivityRegisterParams = {
  categoryId: string;
  month: MonthKey;
};

export function budgetEnvelopeHref(categoryId: string, month: MonthKey): string {
  return `/finances/budget?${new URLSearchParams({ month: monthParamOf(month), detail: categoryId })}`;
}

/** `/finances/register?view=activity&category=<id>&month=YYYY-MM`. */
export function activityRegisterHref(categoryId: string, month: MonthKey): string {
  const params = new URLSearchParams({
    view: "activity",
    category: categoryId,
    month: monthParamOf(month),
  });
  return `/finances/register?${params.toString()}`;
}

/**
 * Read `category` + `month` from the URL. Garbage or missing is null — the Register
 * then degrades to All Transactions rather than inventing a filter.
 */
export function parseActivityRegisterParams(input: {
  category: string | null | undefined;
  month: string | null | undefined;
}): ActivityRegisterParams | null {
  const categoryId = asRecordId(input.category ?? null);
  const month = monthKeyFromParam(input.month ?? null);
  if (!categoryId || !month) return null;
  return { categoryId, month };
}

export function activityEmptyCopy(envelopeName: string, month: MonthKey): string {
  return `No transactions in ${envelopeName} for ${monthLabel(month)}.`;
}

/** Default chips: Category = envelope, Date = that month. `viewRows` is the hard set. */
export function activityViewFilters(
  envelopeName: string,
  month: MonthKey,
): Record<string, ColumnFilter> {
  return {
    category: optionsFilter([`value:${envelopeName}`]),
    date: customFilter("and", [
      { op: "gte", value: month },
      { op: "lte", value: monthEndKey(month) },
    ]),
  };
}

/**
 * The D3 contributing set: on-budget money rows in this envelope and month, minus
 * on-budget-to-on-budget transfers and superseded pending.
 *
 * Transfer / off-budget rules come from `categoryAssignableIds` so they cannot drift
 * from the Category editor. Month, envelope, split parent, and superseded pending sit
 * on top.
 */
export function activityContributionIds(
  rows: readonly TransactionListRow[],
  offBudgetAccountIds: ReadonlySet<string>,
  categoryId: string,
  month: MonthKey,
  supersededPendingIds: ReadonlySet<string> = new Set(),
): Set<string> {
  const assignable = categoryAssignableIds(
    rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      transactionDate: row.transactionDate,
      transferGroupId: row.transferGroupId ?? null,
      effectiveFlow: effectiveFlow(row),
    })),
    offBudgetAccountIds,
  );
  return new Set(
    rows.flatMap((row) => {
      if (row.splitChildCount > 0) return [];
      if (row.budgetCategoryId !== categoryId) return [];
      if (monthKeyOf(row.transactionDate) !== month) return [];
      if (!assignable.has(row.id)) return [];
      if (supersededPendingIds.has(row.id)) return [];
      return [row.id];
    }),
  );
}
