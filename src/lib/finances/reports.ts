import type { EnvelopeKind } from "@/db/schema";
import {
  effectiveFlow,
  monthBuckets,
  type AnalyticsRow,
  type CashFlowPoint,
  type DateRange,
} from "./analytics";
import type { BudgetCategoryRow, BudgetData } from "./budget/queries";
import {
  buildBudget,
  findMonth,
  monthKeyOf,
  shiftMonthKey,
  type MonthKey,
} from "./budget/envelope";
import { budgetRows, type BudgetRow } from "./budget/rows";
import { budgetEnvelopeLabel, nestedBudgetGridRows } from "./budget/hierarchy";
import type { GridRow } from "@/lib/tree/slice";
import type { InsightsWindowKey } from "./insightsFilter";

export type EnvelopeReportRow = AnalyticsRow & {
  budgetCategoryId: string | null;
  groupId: string | null;
  envelopeKind: EnvelopeKind | null;
  incomeRole: "regular" | "other" | null;
  accountOffBudget: boolean;
  contributesToBudget: boolean;
};
export type SpendingScope = "living" | "savings" | "all";
export type ReportFilters = {
  accountIds: string[];
  payeeIds: string[];
  categoryIds: string[];
};
export const EMPTY_REPORT_FILTERS: ReportFilters = {
  accountIds: [],
  payeeIds: [],
  categoryIds: [],
};
export function scopeContains(
  kind: EnvelopeKind | null,
  scope: SpendingScope,
): boolean {
  return scope === "living"
    ? kind === "spending" || kind === "bill"
    : scope === "savings"
      ? kind === "savings"
      : kind !== "income";
}
export function reportRange(
  window: InsightsWindowKey,
  today: string,
  earliest: string | null,
): DateRange {
  const current = monthKeyOf(today);
  const startKey =
    window === "all"
      ? monthKeyOf(earliest ?? today)
      : window === "ytd"
        ? `${today.slice(0, 4)}-01-01`
        : window === "qtd"
          ? `${today.slice(0, 4)}-${String(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`
          : shiftMonthKey(current, -Number(window.slice(0, -1)));
  const first = earliest ? monthKeyOf(earliest) : current;
  return { startKey: startKey < first ? first : startKey, endKey: today };
}
export function applyReportFilters(
  rows: readonly EnvelopeReportRow[],
  filters: ReportFilters,
) {
  return rows.filter(
    (row) =>
      (!filters.accountIds.length || filters.accountIds.includes(row.accountId)) &&
      (!filters.payeeIds.length ||
        filters.payeeIds.includes(row.payeeId ?? "unknown")) &&
      (!filters.categoryIds.length ||
        filters.categoryIds.includes(row.budgetCategoryId ?? "uncategorized")),
  );
}
export function spendingContributions(
  rows: readonly EnvelopeReportRow[],
  scope: SpendingScope,
) {
  return rows.filter(
    (row) => row.contributesToBudget && scopeContains(row.envelopeKind, scope),
  );
}
export function regularIncomeContributions(rows: readonly EnvelopeReportRow[]) {
  return rows.filter(
    (row) =>
      row.contributesToBudget &&
      row.envelopeKind === "income" &&
      row.incomeRole === "regular",
  );
}
export function reportMonthlySeries(
  rows: readonly EnvelopeReportRow[],
  scope: SpendingScope,
  range: DateRange,
  today: string,
): CashFlowPoint[] {
  const spend = spendingContributions(rows, scope);
  const income = regularIncomeContributions(rows);
  const completed: { spend: number; income: number }[] = [];
  return monthBuckets(range).map((bucket) => {
    const inside = (row: EnvelopeReportRow) =>
      row.transactionDate >= bucket.startKey &&
      row.transactionDate <= bucket.endKey &&
      row.transactionDate <= today;
    const spendCents = -spend
      .filter(inside)
      .reduce((sum, row) => sum + row.amountCents, 0);
    const incomeCents = income
      .filter(inside)
      .reduce((sum, row) => sum + row.amountCents, 0);
    const isComplete = bucket.endKey < monthKeyOf(today);
    if (isComplete) completed.push({ spend: spendCents, income: incomeCents });
    const trailing = completed.slice(-12);
    const avgSpend = trailing.length
      ? Math.round(trailing.reduce((sum, row) => sum + row.spend, 0) / trailing.length)
      : null;
    const avgIncome = trailing.length
      ? Math.round(trailing.reduce((sum, row) => sum + row.income, 0) / trailing.length)
      : null;
    return {
      bucket,
      spendCents,
      incomeCents,
      netCents: incomeCents - spendCents,
      fixedCents: 0,
      variableCents: spendCents,
      externalTransferCents: 0,
      trailingSpendCents: avgSpend,
      trailingIncomeCents: avgIncome,
      trailingNetCents:
        avgIncome === null || avgSpend === null ? null : avgIncome - avgSpend,
    };
  });
}
export function completedMonthAverages(
  points: readonly CashFlowPoint[],
  today: string,
) {
  const completed = points.filter((point) => point.bucket.endKey < monthKeyOf(today));
  return [3, 6, 12].map((months) => {
    const window = completed.slice(-months);
    return {
      months,
      count: window.length,
      spendCents: window.length
        ? Math.round(
            window.reduce((sum, row) => sum + row.spendCents, 0) / window.length,
          )
        : null,
      incomeCents: window.length
        ? Math.round(
            window.reduce((sum, row) => sum + row.incomeCents, 0) / window.length,
          )
        : null,
    };
  });
}
export type ReportEnvelope = BudgetRow & {
  carryInCents: number;
  spendingCents: number;
  transactionIds: string[];
};
export function envelopeReportRows(
  data: BudgetData,
  rows: readonly EnvelopeReportRow[],
  options: {
    report: "spending" | "balances";
    month: MonthKey;
    range: DateRange;
    scope: SpendingScope;
    categoryIds: readonly string[];
  },
): {
  rows: GridRow<ReportEnvelope>[];
  envelopes: ReportEnvelope[];
  beforeSetup: boolean;
} {
  const actual = findMonth(data.months, options.month);
  const beforeSetup = options.report === "balances" && !actual;
  if (beforeSetup) return { rows: [], envelopes: [], beforeSetup };
  const month =
    actual ??
    buildBudget({
      categories: data.categories,
      allocations: [],
      activity: [],
      buffered: [],
      startMonth: options.month,
      endMonth: options.month,
      openingCents: 0,
    })[0];
  const contributions = spendingContributions(rows, options.scope).filter(
    (row) =>
      row.transactionDate >= options.range.startKey &&
      row.transactionDate <= options.range.endKey,
  );
  const byEnvelope = new Map<string, EnvelopeReportRow[]>();
  for (const row of contributions) {
    const id = row.budgetCategoryId ?? "uncategorized";
    const list = byEnvelope.get(id) ?? [];
    list.push(row);
    byEnvelope.set(id, list);
  }
  const envelopes = budgetRows(data.groups, data.categories, month)
    .filter(
      (row) =>
        !row.isIncome &&
        (options.report === "balances" || scopeContains(row.kind, options.scope)) &&
        (!options.categoryIds.length || options.categoryIds.includes(row.id)),
    )
    .map((row) => ({
      ...row,
      carryInCents: row.balanceCents - row.assignedCents - row.activityCents,
      spendingCents: -(byEnvelope.get(row.id) ?? []).reduce(
        (sum, tx) => sum + tx.amountCents,
        0,
      ),
      transactionIds: (byEnvelope.get(row.id) ?? []).map((tx) => tx.id),
    }))
    .filter(
      (row) =>
        options.report !== "balances" ||
        !row.hidden ||
        row.assignedCents !== 0 ||
        row.activityCents !== 0 ||
        row.balanceCents !== 0,
    );
  return {
    rows: nestedBudgetGridRows(
      data.groups.filter((group) =>
        options.report === "balances"
          ? group.kind !== "income"
          : scopeContains(group.kind, options.scope),
      ),
      envelopes,
      envelopes,
      { showHidden: true },
    ),
    envelopes,
    beforeSetup: false,
  };
}

/** Name settings can migrate only when they identify exactly one current record. */
export function migrateReportNames(
  names: readonly string[],
  records: readonly { id: string; name: string }[],
): { ids: string[]; unresolved: string[] } {
  const ids: string[] = [],
    unresolved: string[] = [];
  for (const name of names) {
    const matches = records.filter((row) => row.name === name);
    if (matches.length === 1) ids.push(matches[0].id);
    else unresolved.push(name);
  }
  return { ids: [...new Set(ids)], unresolved };
}
export function scopeCategoryIds(
  categories: readonly BudgetCategoryRow[],
  scope: SpendingScope,
) {
  return categories
    .filter((row) => scopeContains(row.kind, scope))
    .map((row) => row.id);
}

export function sumReportActivity(
  rows: readonly Pick<EnvelopeReportRow, "amountCents">[],
): number {
  return rows.reduce((sum, row) => sum + row.amountCents, 0);
}
export function cashMovementRows<T extends AnalyticsRow>(rows: readonly T[]): T[] {
  return rows.filter((row) => effectiveFlow(row) !== "internal_transfer");
}
export function cashMovementSummary(rows: readonly AnalyticsRow[]) {
  const contributing = cashMovementRows(rows);
  const inflowCents = sumReportActivity(
    contributing.filter((row) => row.amountCents > 0),
  );
  const outflowCents = -sumReportActivity(
    contributing.filter((row) => row.amountCents < 0),
  );
  return { inflowCents, outflowCents, netCents: inflowCents - outflowCents };
}
export function cashReportPoints(
  rows: readonly AnalyticsRow[],
  points: readonly CashFlowPoint[],
): CashFlowPoint[] {
  const completed: { inflowCents: number; outflowCents: number; netCents: number }[] =
    [];
  return points.map((point) => {
    const summary = cashMovementSummary(
      rows.filter(
        (row) =>
          row.transactionDate >= point.bucket.startKey &&
          row.transactionDate <= point.bucket.endKey,
      ),
    );
    // Cash-flow averages follow the displayed buckets, including all external movement.
    // Cost-of-living averages separately exclude the current partial month.
    completed.push(summary);
    const trailing = completed.slice(-12);
    const avg = (key: keyof typeof summary) =>
      Math.round(trailing.reduce((sum, row) => sum + row[key], 0) / trailing.length);
    return {
      ...point,
      incomeCents: summary.inflowCents,
      spendCents: summary.outflowCents,
      netCents: summary.netCents,
      fixedCents: 0,
      variableCents: summary.outflowCents,
      trailingIncomeCents: avg("inflowCents"),
      trailingSpendCents: avg("outflowCents"),
      trailingNetCents: avg("netCents"),
    };
  });
}
export function rankedReportSpending(
  rows: readonly EnvelopeReportRow[],
  data: Pick<BudgetData, "categories" | "groups">,
  by: "category" | "merchant" | "group",
) {
  const categories = new Map(data.categories.map((row) => [row.id, row]));
  const groups = new Map(data.groups.map((row) => [row.id, row]));
  const entries = new Map<
    string,
    {
      id: string;
      name: string;
      groupId: string | null;
      parentGroupId: string | null;
      cents: number;
      count: number;
    }
  >();
  for (const row of rows) {
    const category = row.budgetCategoryId
      ? categories.get(row.budgetCategoryId)
      : undefined;
    const group = category?.groupId ? groups.get(category.groupId) : undefined;
    const id =
      by === "merchant"
        ? (row.payeeId ?? "unknown")
        : by === "group"
          ? (row.groupId ?? "ungrouped")
          : (row.budgetCategoryId ?? "uncategorized");
    const name =
      by === "merchant"
        ? (row.payeeName ?? "Unknown payee")
        : by === "group"
          ? group
            ? budgetEnvelopeLabel(data.groups, {
                groupId: group.parentGroupId,
                name: group.name,
              })
            : "Ungrouped"
          : category
            ? budgetEnvelopeLabel(data.groups, category)
            : "Uncategorized";
    const entry = entries.get(id) ?? {
      id,
      name,
      groupId: by === "merchant" ? null : (group?.id ?? null),
      parentGroupId: by === "merchant" ? null : (group?.parentGroupId ?? null),
      cents: 0,
      count: 0,
    };
    entry.cents -= row.amountCents;
    entry.count += 1;
    entries.set(id, entry);
  }
  const total = -sumReportActivity(rows);
  return [...entries.values()]
    .map((row) => ({ ...row, share: total === 0 ? 0 : row.cents / total }))
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
}

/** Envelope selection narrows expenses; the regular-income comparator keeps the same account/payee scope. */
export function spendingComparisonRows(
  rows: readonly EnvelopeReportRow[],
  filters: ReportFilters,
) {
  return applyReportFilters(rows, { ...filters, categoryIds: [] }).filter(
    (row) =>
      row.envelopeKind === "income" ||
      !filters.categoryIds.length ||
      filters.categoryIds.includes(row.budgetCategoryId ?? "uncategorized"),
  );
}
