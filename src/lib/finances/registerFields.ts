/**
 * Filter, search, and sort accessors for every Register column, including the optionally
 * hidden Payee column. Shared by `financeColumns` and the server-prepared row pipeline so
 * a hidden-column filter cannot mean one thing in the header and another on the server.
 */

import { effectiveFlow, effectiveMerchant } from "./analytics";
import { flowLabel } from "./flowLabels";
import { formatUsd } from "./money";
import { feedLabel, type TransactionListRow } from "./types";
import {
  isOptionsFilter,
  optionsFilter,
  type ColumnFilter,
  type FilterKind,
} from "@/lib/grid/customFilter";
import type { GridFilterValue } from "@/lib/grid/filterValue";

export const REGISTER_VISIBLE_COLUMN_IDS = [
  "date",
  "account",
  "description",
  "category",
  "flow",
  "sourceCategory",
  "amount",
  "posted",
  "balance",
  "source",
  "notes",
] as const;

export const REGISTER_FIELD_IDS = [
  "date",
  "account",
  "description",
  "payee",
  "category",
  "flow",
  "sourceCategory",
  "amount",
  "posted",
  "balance",
  "source",
  "notes",
] as const;

export type RegisterFieldId = (typeof REGISTER_FIELD_IDS)[number];

export const REGISTER_FIELD_ID_SET: ReadonlySet<string> = new Set(REGISTER_FIELD_IDS);

export type RegisterField = {
  id: RegisterFieldId;
  filterKind: FilterKind;
  filterValue?: (row: TransactionListRow) => string | null;
  sortValue?: (row: TransactionListRow) => string | number | null | undefined;
};

export const registerFields: Record<RegisterFieldId, RegisterField> = {
  date: {
    id: "date",
    filterKind: "calendar",
    filterValue: (row) => row.transactionDate,
    sortValue: (row) => row.transactionDate,
  },
  account: {
    id: "account",
    filterKind: "enum",
    filterValue: (row) => row.accountName,
    sortValue: (row) => row.accountName.toLowerCase(),
  },
  description: {
    id: "description",
    filterKind: "text",
    filterValue: (row) => row.description || null,
    sortValue: (row) => row.description.toLowerCase(),
  },
  payee: {
    id: "payee",
    filterKind: "enum",
    filterValue: (row) => effectiveMerchant(row) || null,
    sortValue: (row) => effectiveMerchant(row).toLowerCase(),
  },
  category: {
    id: "category",
    filterKind: "enum",
    filterValue: (row) =>
      row.categoryAssignable === false
        ? "Not budgeted"
        : (row.budgetCategoryName ?? "Uncategorized"),
    sortValue: (row) => (row.budgetCategoryName ?? "").toLowerCase(),
  },
  flow: {
    id: "flow",
    filterKind: "enum",
    filterValue: (row) => flowLabel(effectiveFlow(row)),
    sortValue: (row) => flowLabel(effectiveFlow(row)),
  },
  sourceCategory: {
    id: "sourceCategory",
    filterKind: "enum",
    filterValue: (row) => row.sourceCategory || null,
    sortValue: (row) => row.sourceCategory.toLowerCase(),
  },
  amount: {
    id: "amount",
    filterKind: "number",
    filterValue: (row) => formatUsd(row.amountCents),
    sortValue: (row) => row.amountCents,
  },
  posted: {
    id: "posted",
    filterKind: "date",
    filterValue: (row) => (row.pending ? "Pending" : row.postedDate),
    sortValue: (row) => (row.pending ? "\uffff" : row.postedDate),
  },
  balance: {
    id: "balance",
    filterKind: "number",
    filterValue: (row) =>
      row.balanceAfterCents === null ? null : formatUsd(row.balanceAfterCents),
    sortValue: (row) => row.balanceAfterCents,
  },
  source: {
    id: "source",
    filterKind: "enum",
    filterValue: (row) => feedLabel(row.externalSource ?? null),
    sortValue: (row) => feedLabel(row.externalSource ?? null).toLowerCase(),
  },
  notes: {
    id: "notes",
    filterKind: "text",
    filterValue: (row) => row.notes || null,
    sortValue: (row) => row.notes.toLowerCase(),
  },
};

export const REGISTER_FIELDS: readonly RegisterField[] = REGISTER_FIELD_IDS.map(
  (id) => registerFields[id],
);

export function registerFilterValues(
  row: TransactionListRow,
): Record<string, GridFilterValue> {
  const values: Record<string, GridFilterValue> = {};
  for (const field of REGISTER_FIELDS) {
    if (field.filterValue) values[field.id] = field.filterValue(row);
  }
  return values;
}

export function registerFieldKinds(): Record<string, FilterKind | undefined> {
  const kinds: Record<string, FilterKind | undefined> = {};
  for (const field of REGISTER_FIELDS) kinds[field.id] = field.filterKind;
  return kinds;
}

/** All Transactions' Date band. Posted stays on the Achieve `date` list. */
export const THIS_MONTH_DATE_FILTER = optionsFilter(["this-month"]);

export function isThisMonthDateFilter(filter: ColumnFilter | undefined): boolean {
  return (
    filter !== undefined &&
    isOptionsFilter(filter) &&
    filter.ids.length === 1 &&
    filter.ids[0] === "this-month"
  );
}

/**
 * Force Date to This Month and leave every other column's filter alone.
 *
 * All Transactions reseeds Date on every visit so a leftover Achieve id or last
 * visit's Last 30 cannot keep showing the whole ledger. Named views do not call this.
 */
export function reseedAllTransactionsDate(
  filters: Record<string, ColumnFilter>,
): Record<string, ColumnFilter> {
  return { ...filters, date: THIS_MONTH_DATE_FILTER };
}
