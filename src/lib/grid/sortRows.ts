import type { GridRow } from "@/lib/tree/slice";

/**
 * Sorting a prepared `GridRow[]` without destroying its group structure.
 *
 * `DataGrid` used to skip sorting entirely whenever a group header was present — while
 * still drawing the ↑/↓ arrow on the header — so on Projects or Tasks with grouping on,
 * clicking a column appeared to do something and did not. Sorting **within** each group is
 * what the header was always promising.
 *
 * A group header ends the run it precedes, so nested groups fall out for free: each
 * maximal run of consecutive node rows belongs to the innermost header above it, and each
 * run is sorted on its own.
 */

export type SortDirection = "asc" | "desc";

export type SortValue = string | number | null | undefined;

/**
 * Ordering for one cell against another.
 *
 * Blanks sort last in **both** directions rather than flipping to the top on descending: a
 * column of deadlines is being read for the ones that exist, and burying them under thirty
 * empty rows is never the intent. Numbers compare numerically; everything else compares as
 * text with `numeric` on, so `A2` lands before `A10`.
 */
export function compareSortValues(a: SortValue, b: SortValue): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * Sort node rows within each group segment, leaving headers where they are.
 *
 * `Array.prototype.sort` is stable, so rows that tie keep the order the slice produced —
 * which for the tree tabs is the outline's own order, and is the only sensible tiebreak.
 */
export function sortRowsWithinGroups<T>(
  rows: GridRow<T>[],
  valueOf: (row: Extract<GridRow<T>, { kind: "node" }>) => SortValue,
  direction: SortDirection,
): GridRow<T>[] {
  const factor = direction === "asc" ? 1 : -1;
  const out: GridRow<T>[] = [];
  let run: Extract<GridRow<T>, { kind: "node" }>[] = [];

  function flush() {
    if (run.length === 0) return;
    // Blanks stay last regardless of direction, so the factor is applied to the comparison
    // of two present values only.
    run.sort((a, b) => {
      const left = valueOf(a);
      const right = valueOf(b);
      if (left == null || right == null) return compareSortValues(left, right);
      return compareSortValues(left, right) * factor;
    });
    out.push(...run);
    run = [];
  }

  for (const row of rows) {
    if (row.kind === "node") {
      run.push(row);
      continue;
    }
    flush();
    out.push(row);
  }
  flush();

  return out;
}
