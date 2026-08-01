import type { ReactNode } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import type { GridRow } from "@/lib/tree/slice";
import type { CompactRole } from "@/lib/grid/compactFields";

/**
 * A data row the grid can render a cell for — group headers never reach `render`.
 *
 * Generic in its payload so a tab whose rows are not `OutlineNode`s can still use the
 * shared grid; defaults to `OutlineNode` so the tree tabs are unaffected.
 */
export type NodeGridRow<T = OutlineNode> = Extract<GridRow<T>, { kind: "node" }>;

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
export type ColumnDef<TCtx = unknown, TRow = OutlineNode> = {
  id: string;
  label: string;
  /** A CSS grid track size, e.g. `minmax(16rem,1fr)` or `3rem`. */
  width: string;
  align?: ColumnAlign;
  render: (row: NodeGridRow<TRow>, ctx: TCtx) => ReactNode;
  /** Value used for sort. Missing means the column is not sortable. */
  sortValue?: (row: NodeGridRow<TRow>) => string | number | null | undefined;
  /**
   * Canonical string the filter dropdown matches against. Dates are `YYYY-MM-DD`;
   * priorities are `A1` / `A` / `""`. Missing means the column is not filterable.
   */
  filterValue?: (row: NodeGridRow<TRow>) => string | null;
  filterKind?: FilterKind;
  /** When false, the Show Fields dialog cannot hide this column. Default true. */
  hideable?: boolean;
  /**
   * What this column becomes on a phone, where a row has three slots and not thirteen.
   * Omitted means "let `resolveCompactFields` decide" — see `src/lib/grid/compactFields.ts`.
   */
  compact?: CompactRole;
  /**
   * Read-only text for the compact row's meta line. Falls back to `filterValue`, which is
   * already a canonical string for most columns; declare this where that string is ugly
   * (an ISO date) or missing entirely (effort has no filter).
   *
   * Read-only on purpose: below `md` a tap opens the record sheet, so the meta line is for
   * scanning. Inline editing stays the desktop story.
   */
  compactText?: (row: NodeGridRow<TRow>) => string | null;
};

/**
 * The parts of a column that do not depend on the row payload. The header, Show Fields
 * chooser, and template builder only need these, so they stay row-agnostic instead of
 * carrying a type parameter they never use.
 */
export type ColumnMeta = {
  id: string;
  label: string;
  width: string;
  align?: ColumnAlign;
  /** Presence, not shape: the header only asks whether the column can sort or filter. */
  sortValue?: unknown;
  filterValue?: unknown;
  filterKind?: FilterKind;
  hideable?: boolean;
};

/**
 * CSS `grid-template-columns` value for the visible set.
 *
 * A stored override wins over the column's declared track. Overrides are pixel numbers
 * rather than free-text CSS: they come from a drag, and from a settings blob anyone can
 * edit in devtools, so the one thing they must not be able to do is inject a track
 * expression into the layout.
 */
export function buildGridTemplate(
  columns: Pick<ColumnMeta, "id" | "width">[],
  widths?: Record<string, number>,
): string {
  return columns
    .map((column) => {
      const override = widths?.[column.id];
      return override === undefined ? column.width : `${override}px`;
    })
    .join(" ");
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
