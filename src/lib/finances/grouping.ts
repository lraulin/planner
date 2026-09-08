import {
  compareGroupText,
  knownGroupBy,
  type CalendarNoteGroupBy,
  type GridGroupBy,
} from "@/lib/grid/grouping";
import { buildGroupRows, type GroupPart } from "@/lib/grid/groupRows";
import type { GridRow } from "@/lib/tree/slice";
import { effectiveCategory, effectiveFlow } from "./analytics";
import { flowLabel } from "./flowLabels";
import type { TransactionListRow } from "./types";

/**
 * Group dimensions the register offers in the shared Group by picker. Year and month
 * come from the transaction date so a skipped statement is a missing header; account,
 * category and flow are the columns already on the grid (data-grid.md — a group dimension
 * must also be a column).
 *
 * Grouping by flow is how you audit the classifier: open `Transfer (own accounts)` and every
 * row that got taken out of spending is in one list.
 */
export const FINANCE_GROUP_BY_VALUES = [
  "year",
  "month",
  "account",
  "category",
  "flow",
] as const satisfies readonly GridGroupBy[];

export type FinanceGroupBy = (typeof FINANCE_GROUP_BY_VALUES)[number];

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function asFinanceGroupBy(values: readonly string[]): FinanceGroupBy[] {
  return knownGroupBy(values, FINANCE_GROUP_BY_VALUES);
}

type DatePart = { key: string; label: string; rank: number };

/**
 * Year or month of a `YYYY-MM-DD` transaction date. String parts only — these are
 * calendar labels, not instants, so they must not go through `Date`.
 */
export function transactionDatePart(
  dateKey: string,
  dimension: Exclude<CalendarNoteGroupBy, "date" | "day">,
): DatePart | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const [, year, month] = match;
  if (dimension === "year") return { key: year, label: year, rank: Number(year) };
  return {
    key: month,
    label: MONTH_LABELS[Number(month) - 1] ?? month,
    rank: Number(month),
  };
}

const EMPTY_LABELS: Record<FinanceGroupBy, string> = {
  year: "(No Year)",
  month: "(No Month)",
  account: "(No Account)",
  category: "(No Category)",
  flow: "(No Flow)",
};

function isCalendar(dimension: FinanceGroupBy): boolean {
  return dimension === "year" || dimension === "month";
}

function partOf(row: TransactionListRow, dimension: FinanceGroupBy): GroupPart | null {
  if (dimension === "year" || dimension === "month") {
    const part = transactionDatePart(row.transactionDate, dimension);
    return part && { key: part.key, label: part.label, sort: part.rank };
  }
  if (dimension === "account") {
    const name = row.accountName.trim();
    return name === "" ? null : { key: name, label: name, sort: name };
  }
  if (dimension === "flow") {
    const label = flowLabel(effectiveFlow(row));
    return { key: label, label, sort: label };
  }
  // The effective category, matching the column — grouping on the raw user field would
  // file every classified row under "(No Category)".
  const name = effectiveCategory(row);
  return { key: name, label: name, sort: name };
}

function compareParts(
  left: GroupPart,
  right: GroupPart,
  dimension: FinanceGroupBy,
): number {
  if (typeof left.sort === "number" && typeof right.sort === "number") {
    // Newest year / month first, so a missing December sits as a gap between January
    // and November rather than buried at the bottom of a flat date sort.
    return isCalendar(dimension) ? right.sort - left.sort : left.sort - right.sort;
  }
  const compared = compareGroupText(String(left.sort), String(right.sort));
  return isCalendar(dimension) ? -compared : compared;
}

function toGridRow(row: TransactionListRow): GridRow<TransactionListRow> {
  return { kind: "node", id: row.id, node: row, depth: 0 };
}

/**
 * Year-group ids to collapse on first open, leaving `keepYear` expanded.
 *
 * The register groups by year then month and used to expand every year. Six years of
 * history is ~7,000 DOM rows; collapsing prior years leaves the current year (~800 rows)
 * on screen and search/filter still see the rest. Ids match `groupTransactions` for a
 * top-level `year` dimension — if the user has grouped some other way these ids simply
 * do not match anything.
 */
export function collapsedYearGroupIds(
  dateKeys: readonly string[],
  keepYear: string,
): string[] {
  const years = new Set<string>();
  for (const key of dateKeys) {
    const year = key.slice(0, 4);
    if (/^\d{4}$/.test(year) && year !== keepYear) years.add(year);
  }
  return [...years].sort().map((year) => `group:year:${encodeURIComponent(year)}`);
}

/**
 * Nest register rows under the chosen headers (year, month, account, category).
 *
 * Calendar groups run newest first. Categorical groups run alphabetically, empty
 * last. A month that never imported does not get a header, so Nov → Jan is the tell.
 */
export function groupTransactions(
  rows: readonly TransactionListRow[],
  dimensions: readonly string[],
): GridRow<TransactionListRow>[] {
  return buildGroupRows(rows, {
    dimensions: asFinanceGroupBy(dimensions),
    partOf,
    emptyLabel: (dimension) => EMPTY_LABELS[dimension],
    comparePart: compareParts,
    toGridRow,
  });
}
