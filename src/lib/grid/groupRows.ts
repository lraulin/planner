import type { GridRow } from "@/lib/tree/slice";

/**
 * One row's bucket on one dimension.
 *
 * `key` is bucket identity — two rows share a header iff their keys match, so it must be
 * exact rather than displayable. `sort` orders the buckets and may be a number (calendar
 * ranks) or a string (names); `label` is what the header prints.
 */
export type GroupPart = { key: string; label: string; sort: string | number };

/**
 * What a module has to say to nest its rows under column-value headers.
 *
 * Everything else — the sort into bucket order, the header/frame walk, nested group ids,
 * the counts — is the same for every grid and lives in `buildGroupRows`. `partOf` returning
 * `null` means the row has no value on that dimension; the builder files those under
 * `emptyLabel` and orders them last, which is the rule for every grid
 * (`components/data-grid.md`).
 */
export type GroupRowsSpec<TRow, TNode, TDimension extends string> = {
  /** Dimensions to nest, outermost first. Already narrowed to ones this grid knows. */
  dimensions: readonly TDimension[];
  partOf: (row: TRow, dimension: TDimension) => GroupPart | null;
  emptyLabel: (dimension: TDimension) => string;
  /** Order two rows that both have a value on `dimension`. */
  comparePart: (left: GroupPart, right: GroupPart, dimension: TDimension) => number;
  toGridRow: (row: TRow) => GridRow<TNode>;
  /**
   * Order rows that land in the same leaf bucket. Omitted keeps the incoming order, which
   * is the grid's own sort.
   */
  tiebreak?: (left: TRow, right: TRow) => number;
};

/**
 * Put flat rows under nested group headers.
 *
 * Five grids grew their own copy of this walk — Notes, the Register, Statements, Amazon and
 * Accounts — differing only in which buckets a row belongs to and how those buckets order.
 * Those are the two things the spec supplies. The parts that must not differ are here: a
 * header's id encodes the whole path of dimension/key pairs above it (so a collapsed
 * `2026 → March` cannot collapse a different year's March), every header carries the count
 * of the rows beneath it including nested ones, and rows with no value sort last.
 */
export function buildGroupRows<TRow, TNode, TDimension extends string>(
  rows: readonly TRow[],
  spec: GroupRowsSpec<TRow, TNode, TDimension>,
): GridRow<TNode>[] {
  const { dimensions, partOf, emptyLabel, comparePart, toGridRow, tiebreak } = spec;
  if (dimensions.length === 0) return rows.map(toGridRow);

  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort((left, right) => {
    for (const dimension of dimensions) {
      const leftPart = partOf(left.row, dimension);
      const rightPart = partOf(right.row, dimension);
      if (leftPart === null && rightPart === null) continue;
      if (leftPart === null) return 1;
      if (rightPart === null) return -1;
      const compared = comparePart(leftPart, rightPart, dimension);
      if (compared !== 0) return compared;
    }
    return tiebreak?.(left.row, right.row) || left.index - right.index;
  });

  const out: GridRow<TNode>[] = [];
  type Frame = {
    dimension: TDimension;
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
    for (let level = 0; level < dimensions.length; level++) {
      const dimension = dimensions[level];
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
        label: part?.label ?? emptyLabel(dimension),
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
