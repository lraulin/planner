/**
 * Permute a module's pages from a stored id list, without knowing about the bar.
 *
 * The registry in `pages.ts` is the default order. A user who has dragged the bar has a
 * permutation in `shell.pageOrder`; everyone else — and anyone whose stored list is empty —
 * sees the registry. New pages insert in their registry neighbourhood rather than last, so
 * a saved order cannot hide work that shipped after it was written.
 *
 * Slot arithmetic matches `placeField` in `lib/grid/fieldOrder.ts` on purpose, but this
 * module does not import it: navigation must not depend on the grid.
 */

import type { PageEntry } from "./pages";

/**
 * Stored ids that are still in `pages` keep their relative order; unknown ids drop.
 * Built pages missing from the stored list insert after the rightmost *currently present*
 * page that precedes them in `pages` (the registry). Empty or absent stored list is the
 * registry, never an empty bar.
 */
export function applyPageOrder(
  pages: readonly PageEntry[],
  storedIds: readonly string[] | undefined,
): PageEntry[] {
  if (pages.length === 0) return [];
  if (storedIds == null || storedIds.length === 0) return [...pages];

  const byId = new Map(pages.map((page) => [page.id, page]));
  const kept: string[] = [];
  const shown = new Set<string>();
  for (const id of storedIds) {
    if (!byId.has(id) || shown.has(id)) continue;
    shown.add(id);
    kept.push(id);
  }

  const merged = [...kept];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (page == null || shown.has(page.id)) continue;
    const index = pages
      .slice(0, i)
      .map((other) => other.id)
      .filter((other) => shown.has(other))
      .reduce((rightmost, other) => Math.max(rightmost, merged.indexOf(other) + 1), 0);
    merged.splice(index, 0, page.id);
    shown.add(page.id);
  }

  return merged.flatMap((id) => {
    const page = byId.get(id);
    return page ? [page] : [];
  });
}

/**
 * Place `id` so it sits at the drop slot `toIndex` (0 = before the first item,
 * `ids.length` = after the last). If `id` is already in the list, the slot is measured
 * against the list **including** it — the same index a drag-over midpoint reports — so
 * dragging rightward past later tabs does not overshoot by one.
 */
export function placePage(
  ids: readonly string[],
  id: string,
  toIndex: number,
): string[] {
  const from = ids.indexOf(id);
  const without = ids.filter((entry) => entry !== id);
  let index = toIndex;
  if (from >= 0 && from < toIndex) index -= 1;
  index = Math.max(0, Math.min(index, without.length));
  return [...without.slice(0, index), id, ...without.slice(index)];
}

/**
 * Move `id` one slot toward the start or the end of the list.
 *
 * The keyboard and button path into the same reorder the drag does, for the phone (where there
 * is no HTML5 drag) and for anyone arranging from the keyboard. Expressed in `placePage`'s drop
 * slots rather than as a swap so the two paths cannot drift apart about what an index means:
 * a slot is measured against the list *including* the moving id, so one step right is `+2`.
 *
 * A no-op at either end, and for an id the list does not contain.
 */
export function movePage(
  ids: readonly string[],
  id: string,
  direction: "left" | "right",
): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  if (direction === "left" && from === 0) return [...ids];
  if (direction === "right" && from === ids.length - 1) return [...ids];
  return placePage(ids, id, direction === "left" ? from - 1 : from + 2);
}
