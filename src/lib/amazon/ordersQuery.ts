/**
 * Server-prepared Orders index: the shared grid's filter/search/sort/group/collapse
 * pipeline, returning compact row references plus a 100-row detail window.
 *
 * The browser never receives the whole Amazon history. Expanding all may return every id;
 * it never returns every line-item record.
 */

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
import {
  AMAZON_FIELD_ID_SET,
  AMAZON_FIELDS,
  AMAZON_VISIBLE_COLUMN_IDS,
  amazonFieldKinds,
  amazonFields,
  amazonFilterValues,
} from "./amazonFields";
import {
  amazonGroupPaidCents,
  amazonOrderGroupMatch,
  asAmazonGroupBy,
  groupAmazonItems,
} from "./grouping";
import type { AmazonItemListRow } from "./types";

export const AMAZON_BLOCK_SIZE = 100;
export const AMAZON_SEARCH_MAX = 200;
export const AMAZON_PREFETCH = 25;

export type AmazonOrdersQuery = {
  search: string;
  filters: Record<string, ColumnFilter>;
  advancedFilter: CrossColumnFilter | null;
  sorts: GridSort[];
  groupBy: string[];
  collapsedGroups: string[];
  visibleColumnIds: string[];
  today: string | null;
};

export type AmazonOrdersIndexEntry =
  | {
      kind: "group";
      id: string;
      label: string;
      count: number;
      depth: number;
      paidCents: number;
      matchLabel: string | null;
      chargeId: string | null;
    }
  | { kind: "node"; id: string };

export type AmazonOrdersIndex = {
  queryKey: string;
  entries: AmazonOrdersIndexEntry[];
  nodeIds: string[];
  shown: number;
  total: number;
  groupIds: string[];
  facets: Record<string, string[]>;
};

export type AmazonOrdersRowBlock = {
  queryKey: string;
  offset: number;
  rows: AmazonItemListRow[];
};

export type AmazonOrdersPrepared = {
  index: AmazonOrdersIndex;
  block: AmazonOrdersRowBlock;
};

const FIELD_KINDS = amazonFieldKinds();

export function amazonOrdersQueryKey(query: AmazonOrdersQuery): string {
  return JSON.stringify({
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

function asDateKey(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function asSearch(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.slice(0, AMAZON_SEARCH_MAX);
}

function asFilters(value: unknown): Record<string, ColumnFilter> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, ColumnFilter> = {};
  for (const [columnId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!AMAZON_FIELD_ID_SET.has(columnId)) continue;
    const parsed = parseColumnFilter(raw);
    if (parsed && filterActive(parsed)) out[columnId] = parsed;
  }
  return out;
}

function asVisibleColumnIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [...AMAZON_VISIBLE_COLUMN_IDS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !AMAZON_FIELD_ID_SET.has(entry)) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out.length > 0 ? out : [...AMAZON_VISIBLE_COLUMN_IDS];
}

function asSorts(value: unknown, visibleColumnIds: readonly string[]): GridSort[] {
  if (!Array.isArray(value)) return [{ columnId: "date", direction: "desc" }];
  const visible = new Set(visibleColumnIds);
  const out: GridSort[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.columnId !== "string") continue;
    if (!AMAZON_FIELD_ID_SET.has(record.columnId)) continue;
    if (!visible.has(record.columnId)) continue;
    if (!amazonFields[record.columnId as keyof typeof amazonFields].sortValue) continue;
    const direction = record.direction === "asc" ? "asc" : "desc";
    if (out.some((sort) => sort.columnId === record.columnId)) continue;
    out.push({ columnId: record.columnId, direction });
    if (out.length >= MAX_SORT_KEYS) break;
  }
  return out;
}

function allowListedAdvanced(
  filter: CrossColumnFilter | null,
): CrossColumnFilter | null {
  if (filter === null) return null;
  const conditions = filter.conditions.filter((condition) =>
    AMAZON_FIELD_ID_SET.has(condition.columnId),
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

/** Allow-list and cap every Orders query field. Garbage degrades; it never throws. */
export function parseAmazonOrdersQuery(value: unknown): AmazonOrdersQuery {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const visibleColumnIds = asVisibleColumnIds(record.visibleColumnIds);
  return {
    search: asSearch(record.search),
    filters: asFilters(record.filters),
    advancedFilter: allowListedAdvanced(parseCrossColumnFilter(record.advancedFilter)),
    sorts: asSorts(record.sorts, visibleColumnIds),
    groupBy: asAmazonGroupBy(
      Array.isArray(record.groupBy)
        ? record.groupBy.filter((id): id is string => typeof id === "string")
        : ["year", "month"],
    ),
    collapsedGroups: asCollapsedGroups(record.collapsedGroups),
    visibleColumnIds,
    today: asDateKey(record.today),
  };
}

export function parseAmazonBlockOffset(value: unknown): number {
  const offset = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(offset) || offset < 0) return 0;
  return Math.floor(offset / AMAZON_BLOCK_SIZE) * AMAZON_BLOCK_SIZE;
}

function passingRows(
  rows: readonly AmazonItemListRow[],
  query: AmazonOrdersQuery,
): AmazonItemListRow[] {
  const narrowing =
    Object.values(query.filters).some(filterActive) ||
    crossFilterActive(query.advancedFilter) ||
    searchActive(query.search);
  if (!narrowing) return [...rows];

  return rows.filter((row) => {
    const values = amazonFilterValues(row);
    return (
      rowPassesFilters(values, query.filters, FIELD_KINDS, query.today) &&
      rowPassesCrossFilter(values, query.advancedFilter, FIELD_KINDS) &&
      rowMatchesSearch(values, query.search)
    );
  });
}

export function sliceAmazonBlock(
  items: readonly AmazonItemListRow[],
  nodeIds: readonly string[],
  offset: number,
): AmazonItemListRow[] {
  const start = parseAmazonBlockOffset(offset);
  const wanted = nodeIds.slice(start, start + AMAZON_BLOCK_SIZE);
  if (wanted.length === 0) return [];
  const byId = new Map(items.map((row) => [row.id, row]));
  return wanted.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

export function prepareAmazonOrders(
  items: readonly AmazonItemListRow[],
  query: AmazonOrdersQuery,
): AmazonOrdersPrepared {
  const facets = collectDistinctValues(
    AMAZON_FIELDS.map((field) => ({
      id: field.id,
      filterValue: field.filterValue
        ? (row: AmazonItemListRow) => field.filterValue!(row)
        : undefined,
    })),
    items,
  );
  const matched = passingRows(items, query);
  const grouped = groupAmazonItems(matched, query.groupBy);
  const paidByGroup = amazonGroupPaidCents(grouped);
  const matchByGroup = amazonOrderGroupMatch(grouped);
  const collapsed = applyGroupCollapse(grouped, new Set(query.collapsedGroups));
  const keys = query.sorts.flatMap((entry) => {
    const field = amazonFields[entry.columnId as keyof typeof amazonFields];
    if (!field?.sortValue) return [];
    const sortValue = field.sortValue;
    return [
      {
        valueOf: (row: { node: AmazonItemListRow }) => sortValue(row.node),
        direction: entry.direction,
      },
    ];
  });
  const display = keys.length > 0 ? sortRowsWithinGroups(collapsed, keys) : collapsed;

  const entries: AmazonOrdersIndexEntry[] = [];
  const nodeIds: string[] = [];
  const groupIds: string[] = [];
  for (const row of grouped) {
    if (row.kind === "group") groupIds.push(row.id);
  }
  for (const row of display) {
    if (row.kind === "group") {
      const match = matchByGroup.get(row.id);
      entries.push({
        kind: "group",
        id: row.id,
        label: row.label,
        count: row.count,
        depth: row.depth,
        paidCents: paidByGroup.get(row.id) ?? 0,
        matchLabel: match?.matchLabel ?? null,
        chargeId: match?.chargeId ?? null,
      });
      continue;
    }
    entries.push({ kind: "node", id: row.id });
    nodeIds.push(row.id);
  }

  const queryKey = amazonOrdersQueryKey(query);
  return {
    index: {
      queryKey,
      entries,
      nodeIds,
      shown: matched.length,
      total: items.length,
      groupIds,
      facets,
    },
    block: {
      queryKey,
      offset: 0,
      rows: sliceAmazonBlock(items, nodeIds, 0),
    },
  };
}
