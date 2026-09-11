/**
 * Server-prepared Orders index: the shared grid's filter/search/sort/group/collapse
 * pipeline, returning compact row references plus a 100-row detail window.
 *
 * The browser never receives the whole Amazon history. Expanding all may return every id;
 * it never returns every line-item record.
 */

import { applyGroupCollapse } from "@/lib/grid/collapse";
import type { CrossColumnFilter } from "@/lib/grid/crossFilter";
import type { ColumnFilter } from "@/lib/grid/customFilter";
import { collectDistinctValues } from "@/lib/grid/distinct";
import {
  asQueryRecord,
  parseServerGridQuery,
  passingRows,
  SERVER_GRID_BLOCK_SIZE,
  SERVER_GRID_PREFETCH,
  sliceBlock,
  type ServerGridFields,
} from "@/lib/grid/serverQuery";
import { sortRowsWithinGroups } from "@/lib/grid/sortRows";
import type { GridSort } from "@/lib/settings/grid";
import {
  AMAZON_FIELD_ID_SET,
  AMAZON_FIELDS,
  AMAZON_VISIBLE_COLUMN_IDS,
  amazonFieldKinds,
  amazonFields,
  amazonFilterValues,
} from "./amazonFields";
import {
  amazonGroupOrderTotals,
  amazonGroupPaidCents,
  amazonOrderGroupMatch,
  asAmazonGroupBy,
  groupAmazonItems,
} from "./grouping";
import type { AmazonItemListRow } from "./types";

export const AMAZON_BLOCK_SIZE = SERVER_GRID_BLOCK_SIZE;
export const AMAZON_PREFETCH = SERVER_GRID_PREFETCH;

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
      /** Amazon's grand total for the orders under this header, not the item sum. */
      grandTotalCents: number | null;
      unreconciledOrders: number;
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
const FIELDS: ServerGridFields = {
  ids: AMAZON_FIELD_ID_SET,
  defaultVisible: AMAZON_VISIBLE_COLUMN_IDS,
  sortable: (id) => Boolean(amazonFields[id as keyof typeof amazonFields].sortValue),
};

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

/** Allow-list and cap every Orders query field. Garbage degrades; it never throws. */
export function parseAmazonOrdersQuery(value: unknown): AmazonOrdersQuery {
  const record = asQueryRecord(value);
  return {
    ...parseServerGridQuery(record, FIELDS),
    groupBy: asAmazonGroupBy(
      Array.isArray(record.groupBy)
        ? record.groupBy.filter((id): id is string => typeof id === "string")
        : ["year", "month"],
    ),
  };
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
  const matched = passingRows(items, query, amazonFilterValues, FIELD_KINDS);
  const grouped = groupAmazonItems(matched, query.groupBy);
  const paidByGroup = amazonGroupPaidCents(grouped);
  const orderTotalsByGroup = amazonGroupOrderTotals(grouped);
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
      const totals = orderTotalsByGroup.get(row.id);
      entries.push({
        kind: "group",
        id: row.id,
        label: row.label,
        count: row.count,
        depth: row.depth,
        paidCents: paidByGroup.get(row.id) ?? 0,
        grandTotalCents: totals?.grandTotalCents ?? null,
        unreconciledOrders: totals?.unreconciledOrders ?? 0,
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
      rows: sliceBlock(items, nodeIds, 0),
    },
  };
}
