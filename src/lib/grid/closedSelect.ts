/**
 * Options a closed `<select>` should put in the DOM.
 *
 * A native select only needs the selected `<option>` until it is focused — focus fires
 * before the dropdown opens, so expanding on focus still shows the full list. Hydrating
 * every row with the full enum (nine states, here) is otherwise a few hundred extra
 * nodes on the Outline for a menu nobody has opened.
 *
 * If `value` is not in `options`, the full list is returned so the control is not stuck
 * on a blank.
 */
export function closedSelectOptions<T extends { value: string }>(
  expanded: boolean,
  options: readonly T[],
  value: string,
): readonly T[] {
  if (expanded) return options;
  const selected = options.find((option) => option.value === value);
  return selected ? [selected] : options;
}
