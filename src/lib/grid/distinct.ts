/**
 * Distinct filter values per column, for the funnel checklists and the advanced builder's
 * enum operand pickers.
 *
 * Extracted so the grid and its toolbar share one derivation. They must agree: a value
 * offered in the builder but missing from the funnel (or the reverse) would look like a
 * filter that silently does nothing.
 *
 * Computed over **every defined column**, not the visible ones, because the builder offers
 * hidden columns and needs their values too.
 */

type FilterableColumn<TRow> = {
  id: string;
  filterValue?: (row: TRow) => string | null;
};

export function collectDistinctValues<TRow>(
  columns: readonly FilterableColumn<TRow>[],
  rows: readonly TRow[],
): Record<string, string[]> {
  const map: Record<string, string[]> = {};

  for (const column of columns) {
    if (!column.filterValue) continue;
    const filterValue = column.filterValue;
    const seen = new Set<string>();
    for (const row of rows) {
      const value = filterValue(row);
      if (value !== null && value !== "") seen.add(value);
    }
    map[column.id] = Array.from(seen);
  }

  return map;
}
