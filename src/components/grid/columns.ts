import type { ReactNode } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import type { GridRow } from "@/lib/tree/slice";
import type { CompactRole } from "@/lib/grid/compactFields";
import type { FilterKind } from "@/lib/grid/customFilter";

/**
 * A data row the grid can render a cell for — group headers never reach `render`.
 *
 * Generic in its payload so a tab whose rows are not `OutlineNode`s can still use the
 * shared grid; defaults to `OutlineNode` so the tree tabs are unaffected.
 */
export type NodeGridRow<T = OutlineNode> = Extract<GridRow<T>, { kind: "node" }>;

export type ColumnAlign = "left" | "center" | "right";

/** Owned by `@/lib/grid/customFilter`; re-exported so `ColumnDef` reads in one place. */
export type { FilterKind };

/**
 * One column of a data grid. The grid builds its CSS `grid-template-columns` from `width`
 * and asks `render` for each visible node row — no hardcoded `GRID_TEMPLATE`.
 */
export type ColumnDef<TCtx = unknown, TRow = OutlineNode> = {
  id: string;
  label: string;
  /**
   * Name used where a column is *chosen* rather than displayed — Show Fields and the
   * advanced filter's column dropdown. Achieve ships two State columns, wide and narrow,
   * and heads both of them "State"; the header has the cells under it to disambiguate,
   * a list of field names does not. Defaults to `label`, which is right for every column
   * whose header is already unique.
   */
  fieldLabel?: string;
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
  /**
   * How a filter value reads in the set-filter list and on a chip, when the canonical value
   * is not what a person would recognise.
   *
   * The State column filters on Achieve's two-letter codes, because that is what the cell
   * shows and what a stored filter has to keep matching. A checklist of `NS / IP / W / Cn`
   * is not something you can pick from, so it renders `Not started / In progress / …`
   * instead. Matching is untouched — this is presentation only.
   *
   * Omit where the canonical value already reads well, which is most columns.
   */
  filterLabel?: (value: string) => string;
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
  /** Name for pick-lists — see `ColumnDef.fieldLabel`. */
  fieldLabel?: string;
  width: string;
  align?: ColumnAlign;
  /** Presence, not shape: the header only asks whether the column can sort or filter. */
  sortValue?: unknown;
  filterValue?: unknown;
  filterKind?: FilterKind;
  /** Presentation for a filter value — see `ColumnDef.filterLabel`. */
  filterLabel?: (value: string) => string;
  hideable?: boolean;
};

/**
 * The layout commands a column header can issue: the header menu's Move / Hide / Show
 * fields / Reset items, and the drag that reorders columns.
 *
 * One bundle rather than six props because every one of them is the same object on
 * `GridState` (`useGridState` returns it ready-made), and a grid that cannot persist a
 * column layout should not be able to offer half a menu. Omit it and the header keeps the
 * items it can honour on its own — sort, filter, reset width.
 */
export type ColumnControls = {
  show: (id: string, atIndex?: number) => void;
  hide: (id: string) => void;
  move: (id: string, direction: "up" | "down") => void;
  /** Land `id` at `toIndex`, measured against the order including `id` itself. */
  place: (id: string, toIndex: number) => void;
  /** Back to the view's preset column set, order and widths. */
  resetColumns: () => void;
  /** The whole `grid:{tabId}` scope: columns, filters, sort, groups, density. */
  resetGrid: () => void;
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

/** What to call a column in a list of fields to pick from. */
export function fieldNameOf(column: Pick<ColumnMeta, "label" | "fieldLabel">): string {
  return column.fieldLabel ?? column.label;
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
