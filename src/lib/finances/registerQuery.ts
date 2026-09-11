/**
 * Server-prepared Register index: the shared grid's filter/search/sort/group/collapse
 * pipeline, returning compact row references plus a 100-row detail window.
 *
 * The browser never receives the whole ledger. Expanding all may return every id; it
 * never returns every transaction record.
 */

import { asRecordId } from "@/lib/url/viewState";
import { effectiveFlow } from "./analytics";
import { monthKeyFromParam, type MonthKey } from "./budget/envelope";
import { categoryAssignableIds, categoryEligibleIds } from "./categoryEligibility";
import {
  parseReportDrill,
  reportContributionIds,
  type ReportDrill,
} from "./reportDrill";
import { activityContributionIds } from "./registerActivity";
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

export const REGISTER_BLOCK_SIZE = SERVER_GRID_BLOCK_SIZE;
export const REGISTER_PREFETCH = SERVER_GRID_PREFETCH;

export type RegisterViewId = "all" | "uncategorized" | "activity" | "report";

export type RegisterQuery = {
  viewId: RegisterViewId;
  report?: ReportDrill | null;
  /** Envelope id when `viewId` is `activity`; otherwise null. */
  category: string | null;
  /** Budget month (`YYYY-MM-01`) when `viewId` is `activity`; otherwise null. */
  month: MonthKey | null;
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
  /** Stale pending rows Budget already dropped from Activity; default none. */
  supersededPendingIds?: ReadonlySet<string>;
};

export type RegisterIndexEntry =
  | { kind: "group"; id: string; label: string; count: number; depth: number }
  | { kind: "node"; id: string };

export type RegisterIndex = {
  queryKey: string;
  entries: RegisterIndexEntry[];
  nodeIds: string[];
  /** Whole-ledger metadata needed even when a collapsed or filtered row opens by deep link. */
  notBudgetedIds: string[];
  shown: number;
  total: number;
  groupIds: string[];
  facets: Record<string, string[]>;
};

export type RegisterTransactionRow = TransactionListRow & {
  categoryAssignable: boolean;
};

export type RegisterRowBlock<Row extends TransactionListRow = TransactionListRow> = {
  queryKey: string;
  offset: number;
  rows: Row[];
};

export type RegisterPrepared = {
  index: RegisterIndex;
  block: RegisterRowBlock<RegisterTransactionRow>;
};

const VIEW_IDS: ReadonlySet<string> = new Set([
  "all",
  "uncategorized",
  "activity",
  "report",
]);
const FIELD_KINDS = registerFieldKinds();
const FIELDS: ServerGridFields = {
  ids: REGISTER_FIELD_ID_SET,
  defaultVisible: REGISTER_VISIBLE_COLUMN_IDS,
  sortable: (id) =>
    Boolean(registerFields[id as keyof typeof registerFields].sortValue),
};

export function registerQueryKey(query: RegisterQuery): string {
  return JSON.stringify({
    viewId: query.viewId,
    report: query.report ?? null,
    category: query.category,
    month: query.month,
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

/** Allow-list and cap every Register query field. Garbage degrades; it never throws. */
export function parseRegisterQuery(value: unknown): RegisterQuery {
  const record = asQueryRecord(value);
  let viewId = asViewId(record.viewId);
  const category = asRecordId(record.category);
  const month = monthKeyFromParam(
    typeof record.month === "string" ? record.month : null,
  );
  if (viewId === "activity" && (!category || !month)) viewId = "all";
  const report = parseReportDrill(record.report);
  if (viewId === "report" && !report) viewId = "all";
  return {
    ...parseServerGridQuery(record, FIELDS),
    viewId,
    report: viewId === "report" ? report : null,
    category: viewId === "activity" ? category : null,
    month: viewId === "activity" ? month : null,
    groupBy: asFinanceGroupBy(
      Array.isArray(record.groupBy)
        ? record.groupBy.filter((id): id is string => typeof id === "string")
        : ["year", "month"],
    ),
  };
}

export function annotateCategoryAssignability(
  ledger: readonly TransactionListRow[],
  offBudgetAccountIds: ReadonlySet<string>,
): RegisterTransactionRow[] {
  const assignable = categoryAssignableIds(
    ledger.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      transactionDate: row.transactionDate,
      transferGroupId: row.transferGroupId ?? null,
      effectiveFlow: effectiveFlow(row),
    })),
    offBudgetAccountIds,
  );
  return ledger.map((row) => ({
    ...row,
    categoryAssignable: assignable.has(row.id),
  }));
}

function viewRows(
  ledger: readonly TransactionListRow[],
  query: RegisterQuery,
  ctx: RegisterQueryContext,
): TransactionListRow[] {
  if (query.viewId === "report" && query.report) {
    const ids = reportContributionIds(
      ledger,
      query.report,
      ctx.offBudgetAccountIds,
      ctx.supersededPendingIds ?? new Set(),
    );
    return ledger.filter((row) => ids.has(row.id));
  }
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
  if (query.viewId === "activity" && query.category && query.month) {
    const ids = activityContributionIds(
      ledger,
      ctx.offBudgetAccountIds,
      query.category,
      query.month,
      ctx.supersededPendingIds ?? new Set(),
    );
    return ledger.filter((row) => ids.has(row.id));
  }
  return [...ledger];
}

export function prepareRegister(
  ledger: readonly TransactionListRow[],
  query: RegisterQuery,
  ctx: RegisterQueryContext,
): RegisterPrepared {
  const preparedLedger = annotateCategoryAssignability(ledger, ctx.offBudgetAccountIds);
  const base = viewRows(preparedLedger, query, ctx);
  const facets = collectDistinctValues(
    REGISTER_FIELDS.map((field) => ({
      id: field.id,
      filterValue: field.filterValue
        ? (row: TransactionListRow) => field.filterValue!(row)
        : undefined,
    })),
    base,
  );
  const matched = passingRows(base, query, registerFilterValues, FIELD_KINDS);
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
    notBudgetedIds: preparedLedger.flatMap((row) =>
      row.categoryAssignable ? [] : [row.id],
    ),
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
      rows: sliceBlock(preparedLedger, nodeIds, 0),
    },
  };
}
