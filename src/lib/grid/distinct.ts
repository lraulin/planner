/**
 * What values a column actually holds, and how many rows hold each.
 *
 * Derived once and shared by everything that offers a value to pick: the header's set
 * filter, the advanced builder's enum operand list, and the chip bar's label lookup. They
 * must agree — a value offered in one and missing from another looks like a filter that
 * silently does nothing.
 *
 * Computed over **every defined column**, not the visible ones, because the builder offers
 * hidden columns and needs their values too.
 */

export type ColumnValues = {
  /** Non-blank value → number of rows carrying it. */
  counts: Map<string, number>;
  /** Rows whose value is null or empty. Counted separately: blank is not a value. */
  blanks: number;
};

type FilterableColumn<TRow> = {
  id: string;
  filterValue?: (row: TRow) => string | null;
};

export function collectColumnValues<TRow>(
  columns: readonly FilterableColumn<TRow>[],
  rows: readonly TRow[],
): Record<string, ColumnValues> {
  const map: Record<string, ColumnValues> = {};

  for (const column of columns) {
    if (!column.filterValue) continue;
    const counts = new Map<string, number>();
    let blanks = 0;

    for (const row of rows) {
      const value = column.filterValue?.(row) ?? "";
      if (value === "") {
        blanks += 1;
        continue;
      }
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    map[column.id] = { counts, blanks };
  }

  return map;
}

/**
 * Just the value lists, for the consumers that do not care how many rows hold each.
 *
 * A thin view over {@link collectColumnValues} rather than a second walk — two functions
 * counting the same rows is how the header and the builder end up disagreeing about what a
 * column contains.
 */
export function collectDistinctValues<TRow>(
  columns: readonly FilterableColumn<TRow>[],
  rows: readonly TRow[],
): Record<string, string[]> {
  return distinctValuesOf(collectColumnValues(columns, rows));
}

export function distinctValuesOf(
  values: Record<string, ColumnValues>,
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const [columnId, entry] of Object.entries(values)) {
    map[columnId] = Array.from(entry.counts.keys());
  }
  return map;
}
