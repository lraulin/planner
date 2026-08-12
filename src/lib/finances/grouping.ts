import {
  knownGroupBy,
  type CalendarNoteGroupBy,
  type GridGroupBy,
} from "@/lib/grid/grouping";
import type { GridRow } from "@/lib/tree/slice";
import type { TransactionListRow } from "./types";

/**
 * Group dimensions the register can turn into headers. Year and month come from the
 * transaction date (a calendar-day string) — the same calendar parts Notes uses, so a
 * missing month is a missing header rather than a silent hole in a flat list.
 */
export const FINANCE_GROUP_BY_VALUES = [
  "year",
  "month",
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

function partOf(row: TransactionListRow, dimension: FinanceGroupBy): DatePart | null {
  return transactionDatePart(row.transactionDate, dimension);
}

function compareParts(left: DatePart | null, right: DatePart | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  // Newest year / month first, so a missing December sits as a gap between January
  // and November rather than buried at the bottom of a flat date sort.
  return right.rank - left.rank;
}

function toGridRow(row: TransactionListRow): GridRow<TransactionListRow> {
  return { kind: "node", id: row.id, node: row, depth: 0 };
}

/**
 * Nest register rows under year / month headers.
 *
 * Calendar groups run newest first. Empty buckets are omitted — that is the point:
 * a month that never imported does not get a header, so Nov → Jan is the tell.
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
        label: part?.label ?? (dimension === "year" ? "(No Year)" : "(No Month)"),
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
