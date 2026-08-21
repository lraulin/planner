/**
 * Pure helpers for the Show Fields dialog: reorder a column id list and insert or
 * remove ids without knowing anything about the grid UI.
 */

/** Swap `id` one step toward the start (`up`) or end (`down`) of the list. */
export function moveField(
  order: readonly string[],
  id: string,
  direction: "up" | "down",
): string[] {
  const index = order.indexOf(id);
  if (index < 0) return [...order];
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= order.length) return [...order];
  const next = order.slice();
  const current = next[index];
  const neighbor = next[target];
  if (current === undefined || neighbor === undefined) return [...order];
  next[index] = neighbor;
  next[target] = current;
  return next;
}

/**
 * Place `id` so it sits at the drop slot `toIndex` (0 = before the first item,
 * `order.length` = after the last). If `id` is already shown, the slot is measured against
 * the list **including** it — the same index a drag-over midpoint reports — so dragging
 * downward past later items does not overshoot by one.
 */
export function placeField(
  order: readonly string[],
  id: string,
  toIndex: number,
): string[] {
  const from = order.indexOf(id);
  const without = order.filter((entry) => entry !== id);
  // Drop markers count the dragged row while it is still in the list. Once we remove it,
  // every slot after `from` shifts left by one.
  let index = toIndex;
  if (from >= 0 && from < toIndex) index -= 1;
  index = Math.max(0, Math.min(index, without.length));
  return [...without.slice(0, index), id, ...without.slice(index)];
}

/** Append `id` if missing; no-op when it is already shown. */
export function showField(order: readonly string[], id: string): string[] {
  if (order.includes(id)) return [...order];
  return [...order, id];
}

/** Remove `id` when present. Callers enforce hideable / last-column rules. */
export function hideField(order: readonly string[], id: string): string[] {
  return order.filter((entry) => entry !== id);
}

/**
 * A saved column layout, plus any column that shipped after it was saved.
 *
 * **The problem this solves.** A saved `order` lists the columns that are *visible*, so
 * hiding one means leaving it out — and so does not existing yet. A column added to a grid
 * later was therefore invisible to every user who had ever arranged that grid, which is the
 * opposite of who should see new work first. There is no way to tell the two cases apart from
 * `order` alone, so `known` records the columns the grid offered when the layout was written:
 * missing from both is new.
 *
 * `known` is null for every layout saved before that field existed. Those can only speak for
 * the columns they name, so a column hidden back then reads as new and comes back once. That
 * is the deliberate trade: the alternative is that no new column ever reaches the grids
 * someone actually uses.
 *
 * New columns land in their preset neighbourhood — after the last visible column that
 * precedes them in the preset — so the view's intended reading order survives.
 */
export function withNewColumns(
  savedOrder: readonly string[],
  known: readonly string[] | null,
  preset: readonly string[],
): string[] {
  const shown = new Set(savedOrder);
  const knew = new Set(known ?? savedOrder);
  const fresh = preset.filter((id) => !knew.has(id) && !shown.has(id));
  if (fresh.length === 0) return [...savedOrder];

  const merged = [...savedOrder];
  for (const id of fresh) {
    // After the rightmost column that precedes it in the preset and is actually on screen —
    // *rightmost as the user has them*, not as the preset lists them, or a saved order that
    // moved a late column to the front would drag new ones up there with it. Each insertion
    // counts for the next, so two new neighbours stay in their preset order.
    const index = preset
      .slice(0, preset.indexOf(id))
      .filter((other) => shown.has(other))
      .reduce((rightmost, other) => Math.max(rightmost, merged.indexOf(other) + 1), 0);
    merged.splice(index, 0, id);
    shown.add(id);
  }
  return merged;
}
