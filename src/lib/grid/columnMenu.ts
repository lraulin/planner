/**
 * What a column's header menu is allowed to do, given the layout around it.
 *
 * Pure because the interesting part is the edges — the first and last column, the last
 * *visible* column, a column with no width override — and every one of those is a place
 * where an enabled-looking item that does nothing is the failure mode. The menu component
 * asks this and renders; it never re-derives a rule.
 */

import { placeField } from "./fieldOrder";

export type ColumnSortKey = { columnId: string; direction: "asc" | "desc" };

export type ColumnMenuState = {
  /** The sort key this column holds, or null when the grid is not sorted by it. */
  sortDirection: "asc" | "desc" | null;
  canSortAscending: boolean;
  canSortDescending: boolean;
  canClearSort: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canHide: boolean;
  canResetWidth: boolean;
};

export function columnMenuState({
  columnId,
  order,
  sortable,
  hideable,
  sorts,
  widths,
}: {
  columnId: string;
  /** Visible column ids, in display order. */
  order: readonly string[];
  /** Whether the column declares a `sortValue`. */
  sortable: boolean;
  /** `ColumnDef.hideable` — absent means the column may be hidden. */
  hideable?: boolean;
  /** Sort keys, primary first. */
  sorts: readonly ColumnSortKey[];
  /** Column id → pixel width override. */
  widths: Record<string, number>;
}): ColumnMenuState {
  const index = order.indexOf(columnId);
  const present = index >= 0;
  const sortDirection =
    sorts.find((entry) => entry.columnId === columnId)?.direction ?? null;

  return {
    sortDirection,
    // A direction the column already has is offered as unavailable rather than as a no-op
    // click, the same posture `(Select all)` takes when nothing is filtered.
    canSortAscending: sortable && sortDirection !== "asc",
    canSortDescending: sortable && sortDirection !== "desc",
    canClearSort: sortDirection !== null,
    canMoveLeft: present && index > 0,
    canMoveRight: present && index < order.length - 1,
    // Never hide the last column: the grid would have nothing to render a row into. Mirrors
    // the guard in `useGridState.hide`, which is the one that actually refuses.
    canHide: present && hideable !== false && order.length > 1,
    canResetWidth: widths[columnId] !== undefined,
  };
}

/**
 * Which slot a header drag lands in: before the hovered column when the pointer is in its
 * left half, after it when in the right.
 *
 * The slot is measured against the order **including** the dragged column, which is what
 * `placeField` expects — see the note there about the drop marker counting the dragged row.
 */
export function headerDropIndex(hoveredIndex: number, pastMidpoint: boolean): number {
  return pastMidpoint ? hoveredIndex + 1 : hoveredIndex;
}

/** The order a header drag would produce. Kept here so the no-op cases are testable. */
export function reorderByHeaderDrag(
  order: readonly string[],
  columnId: string,
  hoveredIndex: number,
  pastMidpoint: boolean,
): string[] {
  return placeField(order, columnId, headerDropIndex(hoveredIndex, pastMidpoint));
}
