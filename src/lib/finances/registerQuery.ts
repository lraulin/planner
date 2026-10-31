/**
 * Server-prepared Register index: the shared grid's filter/search/sort/group/collapse
 * pipeline, returning compact row references plus a 100-row detail window.
 *
 * The browser never receives the whole ledger. Expanding all may return every id; it
 * never returns every transaction record.
 */

import { asRecordId } from "@/lib/url/viewState";
import { monthKeyFromParam, type MonthKey } from "./budget/envelope";
import {
  categoryAssignableIds,
  categoryEligibilityRow,
  categoryEligibleIds,
  type CategoryEligibilityRow,
} from "./categoryEligibility";
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
import {
  isCustomFilter,
  type ColumnFilter,
  type FilterCondition,
} from "@/lib/grid/customFilter";
import { calendarBandRange } from "@/lib/grid/filters";
import { collectDistinctValues } from "@/lib/grid/distinct";
import {
  asQueryRecord,
  parseServerGridQuery,
  passingRows,
  SERVER_GRID_BLOCK_SIZE,
  SERVER_GRID_PREFETCH,
  sliceBlock,
  sortByQuery,
  type ServerGridFields,
} from "@/lib/grid/serverQuery";
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
    ledger.map(categoryEligibilityRow),
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
      ledger.map(categoryEligibilityRow),
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

/**
 * Every distinct value each column holds in the view's rows, for the filter lists.
 *
 * Over the view's **base** rows, not the matched ones: a set filter that offered only what
 * the current filters leave would shrink its own list as you ticked it. That is also why this
 * cannot be read from a date window: the answer is the whole view. It left the index
 * (`agent-os/specs/2026-10-13-1147-finance-narrow-ledger-reads/` D10) because the list is
 * needed only when a column menu or a filter dialog opens, and the browser asks for it then.
 *
 * Same rows, same function as the index used to carry: the view is decided by `viewId`,
 * `report`, `category` and `month` alone, so the answer is the same for every filter, sort
 * and search over that view.
 */
export function registerFacets(
  ledger: readonly TransactionListRow[],
  query: RegisterQuery,
  ctx: RegisterQueryContext,
): Record<string, string[]> {
  const preparedLedger = annotateCategoryAssignability(ledger, ctx.offBudgetAccountIds);
  return collectDistinctValues(
    REGISTER_FIELDS.map((field) => ({ id: field.id, filterValue: field.filterValue })),
    viewRows(preparedLedger, query, ctx),
  );
}

/**
 * What a windowed read cannot see from its rows: facts about the whole `all` view.
 *
 * `total` is every bank row, and `notBudgetedIds` is every row whose Category is not
 * assignable. Both are whole-ledger facts: a transfer's other leg may be outside the window,
 * and judging it without its partner is the bug `register-prepared-rows` change #1 fixed.
 */
export type RegisterWholeView = {
  total: number;
  notBudgetedIds: readonly string[];
};

/**
 * The rows that can possibly be not budgeted, read narrow.
 *
 * `categoryAssignableIds` refuses a row for exactly three reasons: its account is off budget,
 * it is a leg of a transfer, or its effective flow is `internal_transfer`. A row with none of
 * the three is assignable whatever else is in the ledger, so the other rows never need to be
 * looked at. Transfer partners share a group id, so both legs of a pair are in this set and
 * the partner test sees what it saw over the whole ledger.
 */
export type AssignabilitySubsetRow = CategoryEligibilityRow;

/** Which of the subset's rows are not budgeted, in the order given (the ledger's order). */
export function notBudgetedIdsOf(
  subset: readonly AssignabilitySubsetRow[],
  offBudgetAccountIds: ReadonlySet<string>,
): string[] {
  const assignable = categoryAssignableIds(subset, offBudgetAccountIds);
  return subset.flatMap((row) => (assignable.has(row.id) ? [] : [row.id]));
}

export type RegisterDateBound = { from: string | null; to: string | null };

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The day range one custom condition on a calendar column can match; open where unknown. */
function conditionBound(condition: FilterCondition): RegisterDateBound {
  const operand = condition.value;
  if (!DAY_KEY.test(operand)) return { from: null, to: null };
  switch (condition.op) {
    case "eq":
      return { from: operand, to: operand };
    case "gt":
    case "gte":
      return { from: operand, to: null };
    case "lt":
    case "lte":
      return { from: null, to: operand };
    default:
      return { from: null, to: null };
  }
}

function narrowest(values: readonly (string | null)[], pick: "max" | "min") {
  const known = values.filter((value): value is string => value !== null);
  if (known.length === 0) return null;
  return known.reduce((best, value) =>
    pick === "max" ? (value > best ? value : best) : value < best ? value : best,
  );
}

/**
 * The days the Date column filter can match, as a bound a SQL read may apply, or null when
 * there is none to apply.
 *
 * A **superset**: `prepareRegister` still runs the filter over what is read, and a bound that
 * is looser than the filter only means a few extra rows reach it. The one thing that must not
 * happen is a row the filter keeps falling outside the bound, so every case below errs open.
 *
 * Why this is sound: `passingRows` ANDs the column filters with the advanced filter and the
 * search, so a row outside the Date filter's reach cannot be in `matched` whatever else holds.
 * It applies only to the `all` view, whose base rows are the ledger itself; the other views
 * derive their base set from the whole ledger. An unknown `today` makes every band match
 * everything (`matchesCalendar`), so there is no bound. An id that is not a calendar band
 * matches everything too, and so does any condition other than a comparison with a day.
 * The bands' ranges come from `calendarBandRange`, the function the filter itself uses.
 *
 * `agent-os/specs/2026-10-13-1147-finance-narrow-ledger-reads/` D8, superseding
 * `2026-09-03-1307-register-date-presets` D6.
 */
export function registerDateBound(query: RegisterQuery): RegisterDateBound | null {
  const { today } = query;
  if (query.viewId !== "all" || today === null) return null;
  const filter = query.filters.date;
  if (filter === undefined) return null;

  let bound: RegisterDateBound;
  if (isCustomFilter(filter)) {
    if (filter.conditions.length === 0) return null;
    const parts = filter.conditions.map(conditionBound);
    bound =
      filter.join === "and"
        ? {
            from: narrowest(
              parts.map((part) => part.from),
              "max",
            ),
            to: narrowest(
              parts.map((part) => part.to),
              "min",
            ),
          }
        : {
            // Or: a day is in if any branch has it, so a side is open if any branch is open.
            from: parts.some((part) => part.from === null)
              ? null
              : narrowest(
                  parts.map((part) => part.from),
                  "min",
                ),
            to: parts.some((part) => part.to === null)
              ? null
              : narrowest(
                  parts.map((part) => part.to),
                  "max",
                ),
          };
  } else {
    if (filter.ids.length === 0) return null;
    const ranges = filter.ids.map((id) => calendarBandRange(id, today));
    if (ranges.some((range) => range === null)) return null;
    const known = ranges.filter(
      (range): range is { from: string; to: string } => range !== null,
    );
    bound = {
      from: narrowest(
        known.map((range) => range.from),
        "min",
      ),
      to: narrowest(
        known.map((range) => range.to),
        "max",
      ),
    };
  }
  return bound.from === null && bound.to === null ? null : bound;
}

export function prepareRegister(
  ledger: readonly TransactionListRow[],
  query: RegisterQuery,
  ctx: RegisterQueryContext,
  /**
   * Given when `ledger` is a window of the `all` view rather than all of it. The rows are
   * then annotated from this instead of from each other, and `total` is not their count.
   */
  whole?: RegisterWholeView,
): RegisterPrepared {
  if (whole && query.viewId !== "all") {
    throw new Error("A windowed ledger can only prepare the All Transactions view.");
  }
  const notBudgeted = whole ? new Set(whole.notBudgetedIds) : null;
  const preparedLedger: RegisterTransactionRow[] = notBudgeted
    ? ledger.map((row) => ({ ...row, categoryAssignable: !notBudgeted.has(row.id) }))
    : annotateCategoryAssignability(ledger, ctx.offBudgetAccountIds);
  const base = viewRows(preparedLedger, query, ctx);
  const matched = passingRows(base, query, registerFilterValues, FIELD_KINDS);
  const grouped = groupTransactions(matched, query.groupBy);
  const collapsed = applyGroupCollapse(grouped, new Set(query.collapsedGroups));
  const display = sortByQuery(collapsed, query.sorts, registerFields);

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
    notBudgetedIds: whole
      ? [...whole.notBudgetedIds]
      : preparedLedger.flatMap((row) => (row.categoryAssignable ? [] : [row.id])),
    shown: matched.length,
    total: whole ? whole.total : base.length,
    groupIds,
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
