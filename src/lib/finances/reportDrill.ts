import { isDateKey } from "@/lib/metrics/parse";
import { asRecordId } from "@/lib/url/viewState";
import { categoryAssignableIds } from "./categoryEligibility";
import { effectiveFlow } from "./analytics";
import type { TransactionListRow } from "./types";
export type ReportDrill = {
  basis: "envelope" | "cashflow";
  from: string;
  to: string;
  categoryIds: string[];
  accountIds: string[];
  payeeIds: string[];
  allCategories: boolean;
  uncategorized: boolean;
  direction: "all" | "in" | "out";
};
export function parseReportDrill(value: unknown): ReportDrill | null {
  if (typeof value === "string") {
    try {
      return parseReportDrill(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.basis !== "envelope" && row.basis !== "cashflow") return null;
  if (
    typeof row.from !== "string" ||
    !isDateKey(row.from) ||
    typeof row.to !== "string" ||
    !isDateKey(row.to) ||
    row.to < row.from
  )
    return null;
  const ids = (input: unknown) =>
    Array.isArray(input)
      ? [
          ...new Set(
            input.flatMap((value) => {
              const id = value === "unknown" ? "unknown" : asRecordId(value);
              return id ? [id] : [];
            }),
          ),
        ].slice(0, 1000)
      : [];
  return {
    allCategories: row.allCategories === true,
    basis: row.basis,
    from: row.from,
    to: row.to,
    categoryIds: ids(row.categoryIds),
    accountIds: ids(row.accountIds),
    payeeIds: ids(row.payeeIds),
    uncategorized: row.uncategorized === true,
    direction:
      row.direction === "in" || row.direction === "out" ? row.direction : "all",
  };
}
export function reportRegisterHref(drill: ReportDrill): string {
  return `/finances/register?${new URLSearchParams({ view: "report", report: JSON.stringify(drill) })}`;
}
export function reportContributionIds(
  rows: readonly TransactionListRow[],
  drill: ReportDrill,
  offBudgetIds: ReadonlySet<string>,
  supersededIds: ReadonlySet<string>,
): Set<string> {
  const eligible = categoryAssignableIds(
    rows.map((row) => ({
      ...row,
      transferGroupId: row.transferGroupId ?? null,
      effectiveFlow: effectiveFlow(row),
    })),
    offBudgetIds,
  );
  return new Set(
    rows
      .filter((row) => {
        if (row.splitChildCount > 0 || supersededIds.has(row.id)) return false;
        if (row.transactionDate < drill.from || row.transactionDate > drill.to)
          return false;
        if (drill.accountIds.length && !drill.accountIds.includes(row.accountId))
          return false;
        if (drill.payeeIds.length && !drill.payeeIds.includes(row.payeeId ?? "unknown"))
          return false;
        if (!drill.allCategories) {
          if (
            row.budgetCategoryId === null
              ? !drill.uncategorized
              : !drill.categoryIds.includes(row.budgetCategoryId)
          )
            return false;
        }
        if (
          drill.basis === "envelope"
            ? !eligible.has(row.id)
            : effectiveFlow(row) === "internal_transfer"
        )
          return false;
        if (drill.direction === "in" && row.amountCents <= 0) return false;
        if (drill.direction === "out" && row.amountCents >= 0) return false;
        return true;
      })
      .map((row) => row.id),
  );
}
