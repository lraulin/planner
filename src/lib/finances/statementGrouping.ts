import { knownGroupBy, type GridGroupBy } from "@/lib/grid/grouping";
import type { GridRow } from "@/lib/tree/slice";
import { transactionDatePart } from "./grouping";
import type { StatementViewRow } from "./types";

export const STATEMENT_GROUP_BY_VALUES = [
  "account",
  "year",
  "month",
] as const satisfies readonly GridGroupBy[];

export type StatementGroupBy = (typeof STATEMENT_GROUP_BY_VALUES)[number];

export function asStatementGroupBy(values: readonly string[]): StatementGroupBy[] {
  return knownGroupBy(values, STATEMENT_GROUP_BY_VALUES);
}

type GroupPart = { key: string; label: string; sort: string | number };

const EMPTY: Record<StatementGroupBy, string> = {
  account: "(No Account)",
  year: "(No Year)",
  month: "(No Month)",
};

function partOf(row: StatementViewRow, dimension: StatementGroupBy): GroupPart | null {
  if (dimension === "account") {
    const name = row.accountName.trim();
    return name === "" ? null : { key: name, label: name, sort: name };
  }
  const part = transactionDatePart(row.periodEnd, dimension);
  return part && { key: part.key, label: part.label, sort: part.rank };
}

function toGridRow(row: StatementViewRow): GridRow<StatementViewRow> {
  return { kind: "node", id: row.id, node: row, depth: 0 };
}

export function groupStatements(
  rows: readonly StatementViewRow[],
  dimensions: readonly string[],
): GridRow<StatementViewRow>[] {
  const groupBy = asStatementGroupBy(dimensions);
  if (groupBy.length === 0) return rows.map(toGridRow);

  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort((left, right) => {
    for (const dimension of groupBy) {
      const leftPart = partOf(left.row, dimension);
      const rightPart = partOf(right.row, dimension);
      if (leftPart === null && rightPart === null) continue;
      if (leftPart === null) return 1;
      if (rightPart === null) return -1;
      if (typeof leftPart.sort === "number" && typeof rightPart.sort === "number") {
        const compared =
          dimension === "account"
            ? leftPart.sort - rightPart.sort
            : rightPart.sort - leftPart.sort;
        if (compared !== 0) return compared;
      } else {
        const compared = String(leftPart.sort).localeCompare(String(rightPart.sort));
        if (compared !== 0) return dimension === "account" ? compared : -compared;
      }
    }
    return (
      right.row.periodEnd.localeCompare(left.row.periodEnd) || left.index - right.index
    );
  });

  const out: GridRow<StatementViewRow>[] = [];
  type Frame = {
    dimension: StatementGroupBy;
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
        label: part?.label ?? EMPTY[dimension],
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
