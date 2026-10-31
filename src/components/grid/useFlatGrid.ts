"use client";

import type { GridRow } from "@/lib/tree/slice";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { useMultiSelect } from "./useMultiSelect";
import { useNavigableIds } from "./useNavigableIds";

type FlatRow<TNode> = Extract<GridRow<TNode>, { kind: "node" }>;

/**
 * The selection side of a grid over rows that may include group headers: the filter lists
 * over its records, and multi-select across the order the grid actually shows them in.
 *
 * `initialSelectedId` is the row selected on first render — a deep-linked record.
 */
export function useGridSelection<TNode>(
  gridRows: readonly GridRow<TNode>[],
  columns: Parameters<typeof collectDistinctValues<FlatRow<TNode>>>[0],
  initialSelectedId: string | null = null,
) {
  const nodeRows = gridRows.flatMap((row) => (row.kind === "node" ? [row] : []));
  const distinctValues = collectDistinctValues(columns, nodeRows);
  const { order, onIdsChange } = useNavigableIds(nodeRows.map((row) => row.id));
  const multi = useMultiSelect(order, initialSelectedId);
  return { distinctValues, order, onIdsChange, multi };
}

/** A grid of one row per record, with no tree or groups: its rows plus `useGridSelection`. */
export function useFlatGrid<TNode extends { id: string }>(
  nodes: readonly TNode[],
  columns: Parameters<typeof collectDistinctValues<FlatRow<TNode>>>[0],
  initialSelectedId: string | null = null,
) {
  const gridRows: FlatRow<TNode>[] = nodes.map((node) => ({
    kind: "node",
    id: node.id,
    node,
    depth: 0,
  }));
  return { gridRows, ...useGridSelection(gridRows, columns, initialSelectedId) };
}
