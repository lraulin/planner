/**
 * The half of a server-paged grid's query that does not depend on what the grid lists.
 *
 * The Register and Amazon Orders each send the shared grid's state — search, filters, the
 * advanced filter, sorts, collapsed groups, visible columns — to the server, which filters,
 * groups and sorts the whole history and hands back row references plus one block of records.
 * Both parse that state the same way, and until this module existed they did it in two
 * line-for-line copies that differed only in which field set they allow-listed. A fix to one
 * would not have reached the other.
 *
 * What stays with each grid is what is actually its own: the Register's view ids and drills,
 * each grid's grouping vocabulary, and the group-header totals Orders adds.
 */

import {
  crossFilterActive,
  parseCrossColumnFilter,
  rowPassesCrossFilter,
  type CrossColumnFilter,
} from "./crossFilter";
import { parseColumnFilter, type ColumnFilter, type FilterKind } from "./customFilter";
import type { GridFilterValue } from "./filterValue";
import { filterActive, rowPassesFilters } from "./filters";
import { rowMatchesSearch, searchActive } from "./search";
import { MAX_SORT_KEYS, type GridSort } from "@/lib/settings/grid";

/** Records per block: what one server round trip returns. */
export const SERVER_GRID_BLOCK_SIZE = 100;
export const SERVER_GRID_SEARCH_MAX = 200;
/** Rows either side of the viewport to fetch ahead of a scroll. */
export const SERVER_GRID_PREFETCH = 25;

/** What a grid allows onto its query. */
export type ServerGridFields = {
  /** Every field the grid defines. Anything else in a query is dropped. */
  ids: ReadonlySet<string>;
  /** The columns shown when the query names none that exist. */
  defaultVisible: readonly string[];
  /** Whether a field can be a sort key. */
  sortable: (id: string) => boolean;
};

/** The grid-independent fields of the query, parsed. */
export type ServerGridQuery = {
  search: string;
  filters: Record<string, ColumnFilter>;
  advancedFilter: CrossColumnFilter | null;
  sorts: GridSort[];
  collapsedGroups: string[];
  visibleColumnIds: string[];
  today: string | null;
};

/** An object to read fields off, or an empty one. Garbage degrades; it never throws. */
export function asQueryRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Allow-list and cap every shared field. */
export function parseServerGridQuery(
  record: Record<string, unknown>,
  fields: ServerGridFields,
): ServerGridQuery {
  const visibleColumnIds = asVisibleColumnIds(record.visibleColumnIds, fields);
  return {
    search: asSearch(record.search),
    filters: asFilters(record.filters, fields),
    advancedFilter: allowListedAdvanced(
      parseCrossColumnFilter(record.advancedFilter),
      fields,
    ),
    sorts: asSorts(record.sorts, visibleColumnIds, fields),
    collapsedGroups: asCollapsedGroups(record.collapsedGroups),
    visibleColumnIds,
    today: asDateKey(record.today),
  };
}

function asDateKey(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function asSearch(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.slice(0, SERVER_GRID_SEARCH_MAX);
}

function asFilters(
  value: unknown,
  fields: ServerGridFields,
): Record<string, ColumnFilter> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, ColumnFilter> = {};
  for (const [columnId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!fields.ids.has(columnId)) continue;
    const parsed = parseColumnFilter(raw);
    if (parsed && filterActive(parsed)) out[columnId] = parsed;
  }
  return out;
}

/**
 * Sort keys, resolved against the *visible* columns — `data-grid.md`: a sort on a hidden column
 * is a grid that has silently rearranged itself. An absent list is the default newest-first;
 * an empty one is a deliberate "unsorted".
 */
function asSorts(
  value: unknown,
  visibleColumnIds: readonly string[],
  fields: ServerGridFields,
): GridSort[] {
  if (!Array.isArray(value)) return [{ columnId: "date", direction: "desc" }];
  const visible = new Set(visibleColumnIds);
  const out: GridSort[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.columnId !== "string") continue;
    if (!fields.ids.has(record.columnId)) continue;
    if (!visible.has(record.columnId)) continue;
    if (!fields.sortable(record.columnId)) continue;
    const direction = record.direction === "asc" ? "asc" : "desc";
    if (out.some((sort) => sort.columnId === record.columnId)) continue;
    out.push({ columnId: record.columnId, direction });
    if (out.length >= MAX_SORT_KEYS) break;
  }
  return out;
}

function asVisibleColumnIds(value: unknown, fields: ServerGridFields): string[] {
  if (!Array.isArray(value)) return [...fields.defaultVisible];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !fields.ids.has(entry)) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out.length > 0 ? out : [...fields.defaultVisible];
}

function allowListedAdvanced(
  filter: CrossColumnFilter | null,
  fields: ServerGridFields,
): CrossColumnFilter | null {
  if (filter === null) return null;
  const conditions = filter.conditions.filter((condition) =>
    fields.ids.has(condition.columnId),
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

/** A requested offset, snapped down to a block boundary; anything malformed is 0. */
export function parseBlockOffset(value: unknown): number {
  const offset = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(offset) || offset < 0) return 0;
  return Math.floor(offset / SERVER_GRID_BLOCK_SIZE) * SERVER_GRID_BLOCK_SIZE;
}

/** The rows passing the filters, the advanced filter and the search. */
export function passingRows<Row>(
  rows: readonly Row[],
  query: Pick<ServerGridQuery, "filters" | "advancedFilter" | "search" | "today">,
  filterValues: (row: Row) => Record<string, GridFilterValue>,
  kinds: Record<string, FilterKind | undefined>,
): Row[] {
  const narrowing =
    Object.values(query.filters).some(filterActive) ||
    crossFilterActive(query.advancedFilter) ||
    searchActive(query.search);
  if (!narrowing) return [...rows];

  return rows.filter((row) => {
    const values = filterValues(row);
    return (
      rowPassesFilters(values, query.filters, kinds, query.today) &&
      rowPassesCrossFilter(values, query.advancedFilter, kinds) &&
      rowMatchesSearch(values, query.search)
    );
  });
}

/** One block of records, in display order, for the ids at `offset`. Missing ids drop out. */
export function sliceBlock<Row extends { id: string }>(
  rows: readonly Row[],
  nodeIds: readonly string[],
  offset: number,
): Row[] {
  const start = parseBlockOffset(offset);
  const wanted = nodeIds.slice(start, start + SERVER_GRID_BLOCK_SIZE);
  if (wanted.length === 0) return [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return wanted.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}
