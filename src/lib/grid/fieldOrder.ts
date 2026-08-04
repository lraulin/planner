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
