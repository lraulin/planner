import type { NodeItem } from "@/db/schema";
import { priorityOrderValue } from "@/lib/priority/order";
import {
  compareSortValues,
  type SortDirection,
  type SortValue,
} from "@/lib/grid/sortRows";
import { toDateKey } from "@/lib/schedule/geometry";

/**
 * Client-side sort for the detail form's repeating lists (Benefits, Objectives, Risks, …).
 *
 * Achieve opens these grids ordered by priority. We keep that default when the kind has a
 * Pri column, and let any summary column become the active sort via clickable headers —
 * the same unsorted → asc → desc → unsorted cycle the main grids use.
 *
 * Sorting is display-only: it never rewrites `sortKey`. Manual ↑/↓ reorder stays the path
 * that changes stored order, and is only meaningful when no column sort is active.
 */

/** Column keys the list can sort on — matches the summary columns on each kind. */
export type ItemSortColumn = "priority" | keyof NodeItem;

export type ItemSort = {
  column: ItemSortColumn;
  direction: SortDirection;
};

/** Priority ascending when the list shows Pri; otherwise stored order. */
export function defaultItemSort(columns: readonly ItemSortColumn[]): ItemSort | null {
  return columns.includes("priority") ? { column: "priority", direction: "asc" } : null;
}

/**
 * Achieve-style header cycle: first click on a column sorts ascending; a second click
 * flips to descending; a third clears the sort and returns to stored order. Clicking a
 * different column starts fresh at ascending.
 */
export function cycleItemSort(
  current: ItemSort | null,
  column: ItemSortColumn,
): ItemSort | null {
  if (current?.column !== column) return { column, direction: "asc" };
  if (current.direction === "asc") return { column, direction: "desc" };
  return null;
}

/**
 * Cell value used for comparison. Mirrors the main grid's priority ordering so A1 < A2
 * < A10 < bare A < B1, blanks sort last, and dates / numbers / booleans compare as
 * themselves.
 */
export function itemSortValue(
  item: NodeItem,
  column: ItemSortColumn,
  contactNames?: ReadonlyMap<string, string>,
): SortValue {
  if (column === "priority") {
    return priorityOrderValue(item.priorityLetter, item.priorityRank);
  }

  if (column === "contactId") {
    if (!item.contactId) return null;
    const name = contactNames?.get(item.contactId);
    return name ? name.toLowerCase() : null;
  }

  const value = item[column];
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return toDateKey(value);
  if (typeof value === "number") return value;
  return String(value).toLowerCase();
}

/**
 * Stable sort of a list under the active sort. `null` sort returns the input order
 * (stored `sortKey` order from the query).
 */
export function sortItems(
  items: NodeItem[],
  sort: ItemSort | null,
  contactNames?: ReadonlyMap<string, string>,
): NodeItem[] {
  if (!sort || items.length <= 1) return items;

  const factor = sort.direction === "asc" ? 1 : -1;
  // Stable: decorate with original index so ties keep stored order.
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const left = itemSortValue(a.item, sort.column, contactNames);
      const right = itemSortValue(b.item, sort.column, contactNames);
      // Nulls last in both directions (same rule as the main grid).
      if (left == null || right == null) {
        const blank = compareSortValues(left, right);
        if (blank !== 0) return blank;
      } else {
        const cmp = compareSortValues(left, right) * factor;
        if (cmp !== 0) return cmp;
      }
      return a.index - b.index;
    })
    .map(({ item }) => item);
}
