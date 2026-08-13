import {
  knownGroupBy,
  type CalendarNoteGroupBy,
  type GridGroupBy,
} from "@/lib/grid/grouping";
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

type GroupPart = { key: string; label: string; sort: string | number };

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

function compareText(left: string, right: string): number {
  const readable = left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return readable || left.localeCompare(right, undefined, { numeric: true });
}

function compareParts(
  left: GroupPart | null,
  right: GroupPart | null,
  dimension: FinanceGroupBy,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (typeof left.sort === "number" && typeof right.sort === "number") {
    // Newest year / month first, so a missing December sits as a gap between January
    // and November rather than buried at the bottom of a flat date sort.
    return isCalendar(dimension) ? right.sort - left.sort : left.sort - right.sort;
  }
  const compared = compareText(String(left.sort), String(right.sort));
  return isCalendar(dimension) ? -compared : compared;
}

function toGridRow(row: TransactionListRow): GridRow<TransactionListRow> {
  return { kind: "node", id: row.id, node: row, depth: 0 };
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
  const groupBy = asFinanceGroupBy(dimensions);
  if (groupBy.length === 0) return rows.map(toGridRow);

  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort((left, right) => {
    for (const dimension of groupBy) {
      const compared = compareParts(
        partOf(left.row, dimension),
        partOf(right.row, dimension),
        dimension,
      );
      if (compared !== 0) return compared;
    }
    return left.index - right.index;
  });

  const out: GridRow<TransactionListRow>[] = [];
  type Frame = {
    dimension: FinanceGroupBy;
    key: string;
    rowIndex: number;
    count: number;
  };
  const stack: Frame[] = [];

  function closeTo(depth: number) {
    while (stack.length > depth) {
      const frame = stack.pop()!;
      const header = out[frame.rowIndex];
      if (header.kind === "group") header.count = frame.count;
    }
  }

  for (const { row } of indexed) {
    for (let level = 0; level < groupBy.length; level++) {
      const dimension = groupBy[level];
      const part = partOf(row, dimension);
      const key = part?.key ?? "";
      const frame = stack[level];
      if (frame?.dimension === dimension && frame.key === key) continue;
      closeTo(level);

      const path = [
        ...stack.map((entry) => `${entry.dimension}:${encodeURIComponent(entry.key)}`),
        `${dimension}:${encodeURIComponent(key)}`,
      ];
      const rowIndex = out.length;
      out.push({
        kind: "group",
        id: `group:${path.join("|")}`,
        label: part?.label ?? EMPTY_LABELS[dimension],
        count: 0,
        depth: level,
        collapsed: false,
      });
      stack.push({ dimension, key, rowIndex, count: 0 });
    }

    out.push(toGridRow(row));
    for (const frame of stack) frame.count += 1;
  }

  closeTo(0);
  return out;
}
