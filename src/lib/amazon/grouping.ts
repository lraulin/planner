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
  // Year, month and order are newest-first so a card charge lines up with the
  // orders at the top of the list. Channel stays A–Z.
  if (dimension === "channel") {
    return String(left.sort).localeCompare(String(right.sort));
  }
  if (typeof left.sort === "number" && typeof right.sort === "number") {
    return Number(right.sort) - Number(left.sort);
  }
  return String(right.sort).localeCompare(String(left.sort));
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

/** Paid cents of every item under each group header, nested groups included. */
export function amazonGroupPaidCents(
  rows: readonly GridRow<AmazonItemListRow>[],
): Map<string, number> {
  const paid = new Map<string, number>();
  const stack: { id: string; depth: number }[] = [];
  for (const row of rows) {
    if (row.kind === "group") {
      while (stack.length > 0 && stack[stack.length - 1].depth >= row.depth) {
        stack.pop();
      }
      paid.set(row.id, 0);
      stack.push({ id: row.id, depth: row.depth });
      continue;
    }
    const cents = row.node.itemPaidCents ?? 0;
    for (const frame of stack) {
      paid.set(frame.id, (paid.get(frame.id) ?? 0) + cents);
    }
  }
  return paid;
}

export type AmazonGroupTotals = {
  /** Sum of the grand totals of the distinct orders under this header. */
  grandTotalCents: number | null;
  /** How many of those orders do not reconcile, so the header can say so. */
  unreconciledOrders: number;
};

/**
 * Amazon's own money for each group header.
 *
 * An order's grand total is carried on every one of its item rows, so it is counted once per
 * order rather than once per line. A group where no order stored a total gets `null`, which
 * is what keeps the header from showing `$0.00` for "we do not know".
 */
export function amazonGroupOrderTotals(
  rows: readonly GridRow<AmazonItemListRow>[],
): Map<string, AmazonGroupTotals> {
  const totals = new Map<string, AmazonGroupTotals>();
  const counted = new Map<string, Set<string>>();
  const stack: { id: string; depth: number }[] = [];
  for (const row of rows) {
    if (row.kind === "group") {
      while (stack.length > 0 && stack[stack.length - 1].depth >= row.depth) {
        stack.pop();
      }
      totals.set(row.id, { grandTotalCents: null, unreconciledOrders: 0 });
      counted.set(row.id, new Set());
      stack.push({ id: row.id, depth: row.depth });
      continue;
    }
    for (const frame of stack) {
      const seen = counted.get(frame.id)!;
      if (seen.has(row.node.amazonOrderId)) continue;
      seen.add(row.node.amazonOrderId);
      const current = totals.get(frame.id)!;
      if (row.node.orderGrandTotalCents !== null) {
        current.grandTotalCents =
          (current.grandTotalCents ?? 0) + row.node.orderGrandTotalCents;
      }
      if (
        row.node.orderSummaryStatus !== null &&
        row.node.orderSummaryStatus !== "reconciled"
      ) {
        current.unreconciledOrders += 1;
      }
    }
  }
  return totals;
}

/**
 * Match status and charge for an order group. Year/month buckets stay unlabeled — mixed
 * orders in a month are not one match.
 */
export function amazonOrderGroupMatch(
  rows: readonly GridRow<AmazonItemListRow>[],
): Map<string, { matchLabel: string | null; chargeId: string | null }> {
  const out = new Map<string, { matchLabel: string | null; chargeId: string | null }>();
  const stack: { id: string; depth: number; isOrder: boolean }[] = [];
  for (const row of rows) {
    if (row.kind === "group") {
      while (stack.length > 0 && stack[stack.length - 1].depth >= row.depth) {
        stack.pop();
      }
      const isOrder = /(^|\|)order:/.test(row.id.slice("group:".length));
      if (isOrder) out.set(row.id, { matchLabel: null, chargeId: null });
      stack.push({ id: row.id, depth: row.depth, isOrder });
      continue;
    }
    for (const frame of stack) {
      if (!frame.isOrder) continue;
      const current = out.get(frame.id) ?? { matchLabel: null, chargeId: null };
      if (row.node.matchLabel === "Review" || current.matchLabel === null) {
        current.matchLabel = row.node.matchLabel;
      } else if (row.node.matchLabel === "Matched" && current.matchLabel !== "Review") {
        current.matchLabel = "Matched";
      }
      if (!current.chargeId && row.node.chargeId) current.chargeId = row.node.chargeId;
      out.set(frame.id, current);
    }
  }
  return out;
}

export function amazonReviewChargeTitle(orderIds: readonly string[]): string {
  if (orderIds.length === 1) return `Order ${orderIds[0]}`;
  if (orderIds.length > 1) return `${orderIds.length} orders`;
  return "Amazon charge";
}
