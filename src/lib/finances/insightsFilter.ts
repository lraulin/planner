/**
 * Shared filters, windows and drill keys for the insights dashboard.
 *
 * Every panel reads the same filtered row set. Empty account / category / merchant
 * lists mean *all* — "show me no accounts" is not a useful dashboard state, which is
 * the opposite of the checkbox convention in `src/lib/settings/parse.ts`.
 *
 * Filters do not re-run classification. A transfer stays a transfer after its opposite
 * leg is filtered out; `derived_flow` is what the figure was computed from.
 */

import {
  effectiveCategory,
  effectiveMerchant,
  incomeCentsOf,
  spendCentsOf,
  trailingRange,
  type AnalyticsRow,
  type DateRange,
} from "./analytics";

export type InsightsReportFilter = {
  accountIds: string[];
  categories: string[];
  merchants: string[];
  tags?: string[];
};

export const EMPTY_INSIGHTS_FILTER: InsightsReportFilter = {
  accountIds: [],
  categories: [],
  merchants: [],
  tags: [],
};

export const INSIGHTS_WINDOW_KEYS = [
  "3m",
  "6m",
  "12m",
  "24m",
  "ytd",
  "qtd",
  "all",
] as const;
export type InsightsWindowKey = (typeof INSIGHTS_WINDOW_KEYS)[number];

const TRAILING_MONTHS: Record<
  Exclude<InsightsWindowKey, "ytd" | "qtd" | "all">,
  number
> = {
  "3m": 3,
  "6m": 6,
  "12m": 12,
  "24m": 24,
};

export type InsightsDrill =
  | { kind: "category"; id: string }
  | { kind: "merchant"; id: string }
  | { kind: "bucket"; startKey: string; endKey: string }
  | { kind: "account"; id: string }
  | {
      kind: "sankey";
      id: string;
      role: "source" | "spent" | "kept" | "from-savings" | "category" | "merchant";
    };

export function applyInsightsFilter(
  rows: readonly AnalyticsRow[],
  filter: InsightsReportFilter,
): AnalyticsRow[] {
  const accounts = new Set(filter.accountIds);
  const categories = new Set(filter.categories);
  const merchants = new Set(filter.merchants);
  const tags = new Set(filter.tags ?? []);
  return rows.filter((row) => {
    if (accounts.size > 0 && !accounts.has(row.accountId)) return false;
    if (categories.size > 0 && !categories.has(effectiveCategory(row))) return false;
    if (merchants.size > 0 && !merchants.has(effectiveMerchant(row))) return false;
    if (tags.size > 0 && !(row.tags ?? []).some((tag) => tags.has(tag))) return false;
    return true;
  });
}

/**
 * Resolve a window onto the imported history.
 *
 * Trailing presets (3m/6m/12m/24m) end on the last imported day — same as the frozen
 * dashboard — so adding 3m does not change what 12m means. YTD and QTD take the year and
 * quarter from wall-clock `today`, then clip the end to the last imported day.
 */
export function resolveInsightsRange(
  window: InsightsWindowKey,
  today: string,
  full: DateRange | null,
): DateRange | null {
  if (!full) return null;
  if (window === "all") return full;
  if (window === "ytd" || window === "qtd") {
    const endKey = full.endKey < today ? full.endKey : today;
    const startKey =
      window === "ytd" ? `${today.slice(0, 4)}-01-01` : quarterStart(today);
    if (startKey > endKey) return { startKey: endKey, endKey };
    return { startKey, endKey };
  }
  return trailingRange(full.endKey, TRAILING_MONTHS[window]);
}

function quarterStart(today: string): string {
  const month = Number(today.slice(5, 7));
  const startMonth = month <= 3 ? "01" : month <= 6 ? "04" : month <= 9 ? "07" : "10";
  return `${today.slice(0, 4)}-${startMonth}-01`;
}

export function rowsForDrill(
  rows: readonly AnalyticsRow[],
  drill: InsightsDrill | null,
): AnalyticsRow[] {
  if (!drill) return [...rows];
  switch (drill.kind) {
    case "category":
      return rows.filter(
        (row) => spendCentsOf(row) !== 0 && effectiveCategory(row) === drill.id,
      );
    case "merchant":
      return rows.filter(
        (row) => spendCentsOf(row) !== 0 && effectiveMerchant(row) === drill.id,
      );
    case "bucket":
      return rows.filter(
        (row) =>
          row.transactionDate >= drill.startKey && row.transactionDate <= drill.endKey,
      );
    case "account":
      return rows.filter((row) => row.accountId === drill.id);
    case "sankey":
      return rowsForSankeyDrill(rows, drill);
  }
}

function rowsForSankeyDrill(
  rows: readonly AnalyticsRow[],
  drill: Extract<InsightsDrill, { kind: "sankey" }>,
): AnalyticsRow[] {
  switch (drill.role) {
    case "source":
      return rows.filter(
        (row) => incomeCentsOf(row) > 0 && effectiveMerchant(row) === drill.id,
      );
    case "category":
      return rows.filter(
        (row) => spendCentsOf(row) !== 0 && effectiveCategory(row) === drill.id,
      );
    case "merchant":
      return rows.filter(
        (row) => spendCentsOf(row) !== 0 && effectiveMerchant(row) === drill.id,
      );
    case "spent":
      return rows.filter((row) => spendCentsOf(row) !== 0);
    case "kept":
    case "from-savings":
      // Residuals: no row is "the kept dollars" or "the shortfall".
      return [];
  }
}

export function insightsFilterOptions(rows: readonly AnalyticsRow[]): {
  accounts: { id: string; name: string }[];
  categories: string[];
  merchants: string[];
  tags: string[];
} {
  const accounts = new Map<string, string>();
  const categories = new Set<string>();
  const merchants = new Set<string>();
  const tags = new Set<string>();
  for (const row of rows) {
    accounts.set(row.accountId, row.accountName);
    categories.add(effectiveCategory(row));
    const merchant = effectiveMerchant(row);
    if (merchant) merchants.add(merchant);
    for (const tag of row.tags ?? []) tags.add(tag);
  }
  return {
    accounts: [...accounts.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    categories: [...categories].sort((left, right) => left.localeCompare(right)),
    merchants: [...merchants].sort((left, right) => left.localeCompare(right)),
    tags: [...tags].sort((left, right) => left.localeCompare(right)),
  };
}

export function parseInsightsDrill(value: unknown): InsightsDrill | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (kind === "category" || kind === "merchant" || kind === "account") {
    return typeof record.id === "string" && record.id !== ""
      ? { kind, id: record.id }
      : null;
  }
  if (kind === "bucket") {
    return typeof record.startKey === "string" &&
      typeof record.endKey === "string" &&
      record.startKey !== "" &&
      record.endKey !== ""
      ? { kind, startKey: record.startKey, endKey: record.endKey }
      : null;
  }
  if (kind === "sankey") {
    const roles = [
      "source",
      "spent",
      "kept",
      "from-savings",
      "category",
      "merchant",
    ] as const;
    const role = record.role;
    if (typeof record.id !== "string" || record.id === "") return null;
    if (typeof role !== "string" || !(roles as readonly string[]).includes(role)) {
      return null;
    }
    return { kind, id: record.id, role: role as (typeof roles)[number] };
  }
  return null;
}

export function serializeInsightsDrill(drill: InsightsDrill | null): unknown {
  return drill;
}

export function drillLabel(drill: InsightsDrill): string {
  switch (drill.kind) {
    case "category":
      return drill.id;
    case "merchant":
      return drill.id;
    case "bucket":
      return `${drill.startKey} – ${drill.endKey}`;
    case "account":
      return "One account";
    case "sankey":
      if (drill.role === "spent") return "Spent";
      if (drill.role === "kept") return "Kept";
      if (drill.role === "from-savings") return "From savings";
      return drill.id;
  }
}
