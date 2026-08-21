import { knownGroupBy, type GridGroupBy } from "@/lib/grid/grouping";
import type { GridRow } from "@/lib/tree/slice";
import type { BillRow, SpendRow } from "./commitmentRows";

/**
 * Group dimensions both commitment grids offer. Category and status/active are already
 * columns (`data-grid.md` — a group dimension must also be a column). Cadence and period
 * are not in the shared `GridGroupBy` catalogue, so they stay filter-only.
 */
export const COMMITMENT_GROUP_BY_VALUES = [
  "category",
  "state",
] as const satisfies readonly GridGroupBy[];

export type CommitmentGroupBy = (typeof COMMITMENT_GROUP_BY_VALUES)[number];

export function asCommitmentGroupBy(values: readonly string[]): CommitmentGroupBy[] {
  return knownGroupBy(values, COMMITMENT_GROUP_BY_VALUES);
}

type GroupPart = { key: string; label: string };

const EMPTY: Record<CommitmentGroupBy, string> = {
  category: "(No Category)",
  state: "(No Status)",
};

function categoryPart(category: string): GroupPart {
  const name = category.trim();
  return name === "" ? { key: "", label: EMPTY.category } : { key: name, label: name };
}

function partOfBill(row: BillRow, dimension: CommitmentGroupBy): GroupPart {
  if (dimension === "category") return categoryPart(row.category);
  const label =
    row.status === "cancelled"
      ? "Cancelled"
      : row.status === "ignored"
        ? "Dismissed"
        : "Active";
  return { key: row.status, label };
}

function partOfSpend(row: SpendRow, dimension: CommitmentGroupBy): GroupPart {
  if (dimension === "category") return categoryPart(row.category);
  return row.active
    ? { key: "active", label: "Active" }
    : { key: "paused", label: "Paused" };
}

function toNode<T extends { id: string }>(row: T): GridRow<T> {
  return { kind: "node", id: row.id, node: row, depth: 0 };
}

function groupRows<T extends { id: string }>(
  rows: readonly T[],
  dimensions: readonly string[],
  partOf: (row: T, dimension: CommitmentGroupBy) => GroupPart,
): GridRow<T>[] {
  const groupBy = asCommitmentGroupBy(dimensions);
  if (groupBy.length === 0) return rows.map(toNode);

  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort((left, right) => {
    for (const dimension of groupBy) {
      const compared = partOf(left.row, dimension).label.localeCompare(
        partOf(right.row, dimension).label,
        undefined,
        { sensitivity: "base" },
      );
      if (compared !== 0) return compared;
    }
    return left.index - right.index;
  });

  const out: GridRow<T>[] = [];
  type Frame = { key: string; rowIndex: number; count: number };
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
      const part = partOf(row, groupBy[level]);
      const frame = stack[level];
      if (frame && frame.key === part.key) continue;
      closeTo(level);
      stack.push({ key: part.key, rowIndex: out.length, count: 0 });
      out.push({
        kind: "group",
        id: `g:${stack.map((item) => item.key).join("/")}`,
        label: part.label,
        count: 0,
        depth: level,
        collapsed: false,
      });
    }
    for (const frame of stack) frame.count += 1;
    out.push(toNode(row));
  }
  closeTo(0);
  return out;
}

export function groupBills(
  rows: readonly BillRow[],
  dimensions: readonly string[],
): GridRow<BillRow>[] {
  return groupRows(rows, dimensions, partOfBill);
}

export function groupSpend(
  rows: readonly SpendRow[],
  dimensions: readonly string[],
): GridRow<SpendRow>[] {
  return groupRows(rows, dimensions, partOfSpend);
}
