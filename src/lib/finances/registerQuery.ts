/**
 * Server-prepared Register index: the shared grid's filter/search/sort/group/collapse
 * pipeline, returning compact row references plus a 100-row detail window.
 *
 * The browser never receives the whole ledger. Expanding all may return every id; it
 * never returns every transaction record.
 */

import { effectiveFlow } from "./analytics";
import { categoryEligibleIds } from "./categoryEligibility";
import { asFinanceGroupBy, groupTransactions } from "./grouping";
import {
  REGISTER_FIELD_ID_SET,
  REGISTER_FIELDS,
  REGISTER_VISIBLE_COLUMN_IDS,
  registerFieldKinds,
  registerFields,
  registerFilterValues,
} from "./registerFields";
import type { TransactionListRow } from "./types";
import { applyGroupCollapse } from "@/lib/grid/collapse";
import {
  crossFilterActive,
  parseCrossColumnFilter,
  rowPassesCrossFilter,
  type CrossColumnFilter,
} from "@/lib/grid/crossFilter";
import { parseColumnFilter, type ColumnFilter } from "@/lib/grid/customFilter";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { filterActive, rowPassesFilters } from "@/lib/grid/filters";
import { rowMatchesSearch, searchActive } from "@/lib/grid/search";
import { sortRowsWithinGroups } from "@/lib/grid/sortRows";
import { MAX_SORT_KEYS, type GridSort } from "@/lib/settings/grid";

export const REGISTER_BLOCK_SIZE = 100;
export const REGISTER_SEARCH_MAX = 200;
export const REGISTER_PREFETCH = 25;

export type RegisterViewId = "all" | "uncategorized" | "tag";

export type RegisterQuery = {
  viewId: RegisterViewId;
  tag: string | null;
  search: string;
  filters: Record<string, ColumnFilter>;
  advancedFilter: CrossColumnFilter | null;
  sorts: GridSort[];
  groupBy: string[];
  collapsedGroups: string[];
  visibleColumnIds: string[];
  today: string | null;
};

export type RegisterQueryContext = {
  offBudgetAccountIds: ReadonlySet<string>;
  budgetStartMonth: string | null;
};

export type RegisterIndexEntry =
  | { kind: "group"; id: string; label: string; count: number; depth: number }
  | { kind: "node"; id: string };

export type RegisterIndex = {
  queryKey: string;
  entries: RegisterIndexEntry[];
  nodeIds: string[];
  shown: number;
  total: number;
  groupIds: string[];
  facets: Record<string, string[]>;
};

export type RegisterRowBlock = {
  queryKey: string;
  offset: number;
  rows: TransactionListRow[];
};

export type RegisterPrepared = {
  index: RegisterIndex;
  block: RegisterRowBlock;
};

const VIEW_IDS: ReadonlySet<string> = new Set(["all", "uncategorized", "tag"]);
const FIELD_KINDS = registerFieldKinds();

export function registerQueryKey(query: RegisterQuery): string {
  return JSON.stringify({
    viewId: query.viewId,
    tag: query.tag,
    search: query.search,
    filters: query.filters,
    advancedFilter: query.advancedFilter,
    sorts: query.sorts,
    groupBy: query.groupBy,
    collapsedGroups: [...query.collapsedGroups].sort(),
    visibleColumnIds: query.visibleColumnIds,
    today: query.today,
  });
}

function asViewId(value: unknown): RegisterViewId {
  return typeof value === "string" && VIEW_IDS.has(value)
    ? (value as RegisterViewId)
    : "all";
}

function asDateKey(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function asTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tag = value.trim().slice(0, 64);
  return tag === "" ? null : tag;
}

function asSearch(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.slice(0, REGISTER_SEARCH_MAX);
}

function asFilters(value: unknown): Record<string, ColumnFilter> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, ColumnFilter> = {};
  for (const [columnId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!REGISTER_FIELD_ID_SET.has(columnId)) continue;
    const parsed = parseColumnFilter(raw);
    if (parsed && filterActive(parsed)) out[columnId] = parsed;
  }
  return out;
}

function asSorts(value: unknown, visibleColumnIds: readonly string[]): GridSort[] {
  if (!Array.isArray(value)) return [{ columnId: "date", direction: "desc" }];
  const visible = new Set(visibleColumnIds);
  const out: GridSort[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.columnId !== "string") continue;
    if (!REGISTER_FIELD_ID_SET.has(record.columnId)) continue;
    if (!visible.has(record.columnId)) continue;
    if (!registerFields[record.columnId as keyof typeof registerFields].sortValue) {
      continue;
    }
    const direction = record.direction === "asc" ? "asc" : "desc";
    if (out.some((sort) => sort.columnId === record.columnId)) continue;
    out.push({ columnId: record.columnId, direction });
    if (out.length >= MAX_SORT_KEYS) break;
  }
  return out;
}

function asVisibleColumnIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [...REGISTER_VISIBLE_COLUMN_IDS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !REGISTER_FIELD_ID_SET.has(entry)) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out.length > 0 ? out : [...REGISTER_VISIBLE_COLUMN_IDS];
}

function allowListedAdvanced(
  filter: CrossColumnFilter | null,
): CrossColumnFilter | null {
  if (filter === null) return null;
  const conditions = filter.conditions.filter((condition) =>
    REGISTER_FIELD_ID_SET.has(condition.columnId),
  );
  if (conditions.length === 0) return null;
  return { join: filter.join, conditions };
}

function asCollapsedGroups(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || entry === "" || entry.length > 200) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out;
}

/** Allow-list and cap every Register query field. Garbage degrades; it never throws. */
export function parseRegisterQuery(value: unknown): RegisterQuery {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const visibleColumnIds = asVisibleColumnIds(record.visibleColumnIds);
  const viewId = asViewId(record.viewId);
  return {
    viewId,
    tag: viewId === "tag" ? asTag(record.tag) : null,
    search: asSearch(record.search),
    filters: asFilters(record.filters),
    advancedFilter: allowListedAdvanced(parseCrossColumnFilter(record.advancedFilter)),
    sorts: asSorts(record.sorts, visibleColumnIds),
    groupBy: asFinanceGroupBy(
      Array.isArray(record.groupBy)
        ? record.groupBy.filter((id): id is string => typeof id === "string")
        : ["year", "month"],
    ),
    collapsedGroups: asCollapsedGroups(record.collapsedGroups),
    visibleColumnIds,
    today: asDateKey(record.today),
  };
}

export function parseBlockOffset(value: unknown): number {
  const offset = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(offset) || offset < 0) return 0;
  return Math.floor(offset / REGISTER_BLOCK_SIZE) * REGISTER_BLOCK_SIZE;
}

function viewRows(
  ledger: readonly TransactionListRow[],
  query: RegisterQuery,
  ctx: RegisterQueryContext,
): TransactionListRow[] {
  if (query.viewId === "uncategorized") {
    const eligible = categoryEligibleIds(
      ledger.map((row) => ({
        id: row.id,
        accountId: row.accountId,
        transactionDate: row.transactionDate,
        transferGroupId: row.transferGroupId ?? null,
        effectiveFlow: effectiveFlow(row),
      })),
      ctx.offBudgetAccountIds,
      ctx.budgetStartMonth,
    );
    return ledger.filter(
      (row) => eligible.has(row.id) && row.budgetCategoryId === null,
    );
  }
  if (query.viewId === "tag" && query.tag) {
    return ledger.filter((row) => (row.tags ?? []).includes(query.tag as string));
  }
  return [...ledger];
}

function passingRows(
  rows: readonly TransactionListRow[],
  query: RegisterQuery,
): TransactionListRow[] {
  const narrowing =
    Object.values(query.filters).some(filterActive) ||
    crossFilterActive(query.advancedFilter) ||
    searchActive(query.search);
  if (!narrowing) return [...rows];

  return rows.filter((row) => {
    const values = registerFilterValues(row);
    return (
      rowPassesFilters(values, query.filters, FIELD_KINDS, query.today) &&
      rowPassesCrossFilter(values, query.advancedFilter, FIELD_KINDS) &&
      rowMatchesSearch(values, query.search)
    );
  });
}

export function sliceRegisterBlock(
  ledger: readonly TransactionListRow[],
  nodeIds: readonly string[],
  offset: number,
): TransactionListRow[] {
  const start = parseBlockOffset(offset);
  const wanted = nodeIds.slice(start, start + REGISTER_BLOCK_SIZE);
  if (wanted.length === 0) return [];
  const byId = new Map(ledger.map((row) => [row.id, row]));
  return wanted.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

export function prepareRegister(
  ledger: readonly TransactionListRow[],
  query: RegisterQuery,
  ctx: RegisterQueryContext,
): RegisterPrepared {
  const base = viewRows(ledger, query, ctx);
  const facets = collectDistinctValues(
    REGISTER_FIELDS.map((field) => ({
      id: field.id,
      filterValue: field.filterValue
        ? (row: TransactionListRow) => field.filterValue!(row)
        : undefined,
      filterValues: field.filterValues
        ? (row: TransactionListRow) => field.filterValues!(row)
        : undefined,
    })),
    base,
  );
  const matched = passingRows(base, query);
  const grouped = groupTransactions(matched, query.groupBy);
  const collapsed = applyGroupCollapse(grouped, new Set(query.collapsedGroups));
  const keys = query.sorts.flatMap((entry) => {
    const field = registerFields[entry.columnId as keyof typeof registerFields];
    if (!field?.sortValue) return [];
    const sortValue = field.sortValue;
    return [
      {
        valueOf: (row: { node: TransactionListRow }) => sortValue(row.node),
        direction: entry.direction,
      },
    ];
  });
  const display = keys.length > 0 ? sortRowsWithinGroups(collapsed, keys) : collapsed;

  const entries: RegisterIndexEntry[] = [];
  const nodeIds: string[] = [];
  const groupIds: string[] = [];
  for (const row of grouped) {
    if (row.kind === "group") groupIds.push(row.id);
  }
  for (const row of display) {
    if (row.kind === "group") {
      entries.push({
        kind: "group",
        id: row.id,
        label: row.label,
        count: row.count,
        depth: row.depth,
      });
      continue;
    }
    entries.push({ kind: "node", id: row.id });
    nodeIds.push(row.id);
  }

  const queryKey = registerQueryKey(query);
  const index: RegisterIndex = {
    queryKey,
    entries,
    nodeIds,
    shown: matched.length,
    total: base.length,
    groupIds,
    facets,
  };
  return {
    index,
    block: {
      queryKey,
      offset: 0,
      rows: sliceRegisterBlock(ledger, nodeIds, 0),
    },
  };
}

export function registerBlockAt(
  ledger: readonly TransactionListRow[],
  query: RegisterQuery,
  ctx: RegisterQueryContext,
  offset: number,
): RegisterRowBlock {
  const prepared = prepareRegister(ledger, query, ctx);
  const start = parseBlockOffset(offset);
  return {
    queryKey: prepared.index.queryKey,
    offset: start,
    rows: sliceRegisterBlock(ledger, prepared.index.nodeIds, start),
  };
}
