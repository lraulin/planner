/** A new set holding `values`, with `value` removed if it was there and added if it was not. */
export function toggledIn<T>(values: Iterable<T>, value: T): Set<T> {
  const next = new Set(values);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
