import type { ColumnMeta } from "@/components/grid/columns";

/**
 * How a group header divides its track when it carries per-column totals.
 *
 * `labelSpan` is a count of CSS grid tracks starting at track 1, and track 1 is the drag
 * handle gutter — not a column. `cells` covers the tracks that remain, one entry per
 * column in `columns.slice(labelSpan - 1)`, holding that column's id when it has a total
 * and `null` when it does not.
 */
export type TotalsLayout = {
  labelSpan: number;
  cells: readonly (string | null)[];
};

/**
 * Which tracks a group header's label keeps, and which columns get a total cell.
 *
 * The label runs from the gutter through the column *before* the first column carrying a
 * total, so a long group name keeps the room it has today and every total lands under the
 * values it sums. A grid that passes no totals — every grid but Budget and Supplies — gets
 * the full-span label it renders today, which is what an empty `cells` means.
 *
 * Totals keyed to a column that is hidden or does not exist are dropped rather than shifted
 * into the neighbouring track: a number under the wrong heading is worse than no number.
 * A total keyed to the *first* column is dropped for the same reason — the label cell never
 * gives up the name column, or a collapsed group is a figure with nothing to say what it is.
 */
export function totalsLayout(
  columns: readonly ColumnMeta[],
  totals: Readonly<Record<string, unknown>> | null | undefined,
): TotalsLayout {
  const fullSpan = { labelSpan: columns.length + 1, cells: [] as const };
  if (!totals) return fullSpan;

  // The label always keeps the gutter and the first column, so a total there has nowhere
  // to sit and the search for the first totalled column starts at index 1.
  const first = columns.findIndex(
    (column, index) => index > 0 && totals[column.id] !== undefined,
  );
  if (first < 0) return fullSpan;

  return {
    labelSpan: first + 1,
    cells: columns
      .slice(first)
      .map((column) => (totals[column.id] === undefined ? null : column.id)),
  };
}
