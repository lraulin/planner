import {
  knownGroupBy,
  type CalendarNoteGroupBy,
  type GridGroupBy,
} from "@/lib/grid/grouping";
import type { GridRow } from "@/lib/tree/slice";
import type { AmazonItemListRow } from "./types";

export const AMAZON_GROUP_BY_VALUES = [
  "year",
  "month",
  "order",
  "channel",
] as const satisfies readonly GridGroupBy[];

export type AmazonGroupBy = (typeof AMAZON_GROUP_BY_VALUES)[number];

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

export function asAmazonGroupBy(values: readonly string[]): AmazonGroupBy[] {
  return knownGroupBy(values, AMAZON_GROUP_BY_VALUES);
}

type GroupPart = { key: string; label: string; sort: string | number };

function datePart(
  dateKey: string,
  dimension: Extract<CalendarNoteGroupBy, "year" | "month">,
): GroupPart | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const [, year, month] = match;
  if (dimension === "year") return { key: year, label: year, sort: Number(year) };
  return {
    key: month,
    label: MONTH_LABELS[Number(month) - 1] ?? month,
    sort: Number(month),
  };
}

const EMPTY: Record<AmazonGroupBy, string> = {
  year: "(No Year)",
  month: "(No Month)",
  order: "(No Order)",
  channel: "(No Channel)",
};

function partOf(row: AmazonItemListRow, dimension: AmazonGroupBy): GroupPart {
  if (dimension === "year" || dimension === "month") {
    return (
      datePart(row.orderDate, dimension) ?? {
        key: "",
        label: EMPTY[dimension],
        sort: dimension === "year" ? 0 : 13,
      }
    );
  }
  if (dimension === "order") {
    return {
      key: row.amazonOrderId,
      label: row.amazonOrderId || EMPTY.order,
      sort: `${row.orderDate}|${row.amazonOrderId}`,
    };
  }
  const label = row.channel === "digital" ? "Digital" : "Retail";
  return { key: row.channel, label, sort: label };
}

function compareParts(
  left: GroupPart,
  right: GroupPart,
  dimension: AmazonGroupBy,
): number {
  if (dimension === "year" || dimension === "month") {
    return Number(right.sort) - Number(left.sort);
  }
  return String(left.sort).localeCompare(String(right.sort));
}

function toGridRow(row: AmazonItemListRow): GridRow<AmazonItemListRow> {
  return { kind: "node", id: row.id, node: row, depth: 0 };
}

export function groupAmazonItems(
  rows: readonly AmazonItemListRow[],
  dimensions: readonly string[],
): GridRow<AmazonItemListRow>[] {
  const groupBy = asAmazonGroupBy(dimensions);
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

  const out: GridRow<AmazonItemListRow>[] = [];
  type Frame = {
    dimension: AmazonGroupBy;
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
      const frame = stack[level];
      if (frame?.dimension === dimension && frame.key === part.key) continue;
      closeTo(level);
      const path = [
        ...stack.map((entry) => `${entry.dimension}:${encodeURIComponent(entry.key)}`),
        `${dimension}:${encodeURIComponent(part.key)}`,
      ];
      const rowIndex = out.length;
      out.push({
        kind: "group",
        id: `group:${path.join("|")}`,
        label: part.label,
        count: 0,
        depth: level,
        collapsed: false,
      });
      stack.push({ dimension, key: part.key, rowIndex, count: 0 });
    }
    for (const frame of stack) frame.count += 1;
    out.push(toGridRow(row));
  }
  closeTo(0);
  return out;
}
