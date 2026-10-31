/**
 * Place `id` so it sits at the drop slot `toIndex` (0 = before the first item,
 * `order.length` = after the last). If `id` is already in the list, the slot is measured
 * against the list **including** it — the same index a drag-over midpoint reports — so
 * dragging past later items does not overshoot by one.
 *
 * Shared by every user-ordered list of ids: a grid's visible fields, the shell's page tabs.
 */
export function placeAt(
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
