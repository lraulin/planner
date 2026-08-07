"use client";

import { useMemo, useState } from "react";

/**
 * The row order the arrows and Shift-range should walk: what `DataGrid` is actually showing.
 *
 * A host builds the rows it hands *into* the grid, but the grid does the narrowing — filters,
 * quick search, the advanced filter, multi-column sort and collapsed groups all happen inside
 * it. Selecting against the input list therefore walks an order the user is not looking at:
 * after a sort, Shift+Down lands somewhere else on screen; after a filter, a Shift-range spans
 * rows that are not there, and `useMultiSelect` cannot prune a selection it never learns has
 * gone. Where a command acts on the whole selection, it acts on rows the user cannot see.
 *
 * Pass `onIdsChange` to `DataGrid.onNavigableIdsChange` and `order` to `useMultiSelect`.
 * `fallback` stands in for the very first render, before the grid has reported anything.
 *
 * The memo matters: the fallback branch builds a new array, and consumers key off its
 * identity — an unmemoised order rebuilds every callback that closes over it, which is how a
 * command registration turns into a re-render loop.
 */
export function useNavigableIds(fallback: readonly string[]) {
  const [navigableIds, setNavigableIds] = useState<readonly string[]>([]);

  const order = useMemo(
    () => (navigableIds.length > 0 ? navigableIds : fallback),
    [navigableIds, fallback],
  );

  return { order, onIdsChange: setNavigableIds };
}
