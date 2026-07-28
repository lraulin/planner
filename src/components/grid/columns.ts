import type { ReactNode } from "react";
import type { GridRow } from "@/lib/tree/slice";

/** A data row the grid can render a cell for — group headers never reach `render`. */
export type NodeGridRow = Extract<GridRow, { kind: "node" }>;

export type ColumnAlign = "left" | "center" | "right";

/**
 * How the column's filter dropdown behaves. Semantic presets (priority ranks, deadline
 * bands) hang off `filterKind`; plain columns only get (All)/(Blanks)/(NonBlanks)/values.
 */
export type FilterKind = "text" | "priority" | "date" | "enum";

/**
 * One column of a data grid. The grid builds its CSS `grid-template-columns` from `width`
 * and asks `render` for each visible node row — no hardcoded `GRID_TEMPLATE`.
 */
export type ColumnDef<TCtx = unknown> = {
  id: string;
  label: string;
  /** A CSS grid track size, e.g. `minmax(16rem,1fr)` or `3rem`. */
  width: string;
  align?: ColumnAlign;
  render: (row: NodeGridRow, ctx: TCtx) => ReactNode;
  /** Value used for sort. Missing means the column is not sortable. */
  sortValue?: (row: NodeGridRow) => string | number | null | undefined;
  /**
   * Canonical string the filter dropdown matches against. Dates are `YYYY-MM-DD`;
   * priorities are `A1` / `A` / `""`. Missing means the column is not filterable.
   */
  filterValue?: (row: NodeGridRow) => string | null;
  filterKind?: FilterKind;
  /** When false, the Show Fields dialog cannot hide this column. Default true. */
  hideable?: boolean;
};

/** CSS `grid-template-columns` value for the visible set. */
export function buildGridTemplate(columns: Pick<ColumnDef, "width">[]): string {
  return columns.map((column) => column.width).join(" ");
}

export function alignClass(align: ColumnAlign | undefined): string {
  switch (align) {
    case "center":
      return "text-center justify-center";
    case "right":
      return "text-right justify-end";
    default:
      return "text-left justify-start";
  }
}
