"use client";

import type { GridRow } from "@/lib/tree/slice";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { useMultiSelect } from "./useMultiSelect";
import { useNavigableIds } from "./useNavigableIds";

type FlatRow<TNode> = Extract<GridRow<TNode>, { kind: "node" }>;

/**
 * A grid of one row per record, with no tree: the rows `DataGrid` draws, the filter lists
 * over them, and multi-select across the order the grid actually shows them in.
 *
 * `initialSelectedId` is the row selected on first render — a deep-linked record.
 */
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
  const distinctValues = collectDistinctValues(columns, gridRows);
  const { order, onIdsChange } = useNavigableIds(nodes.map((node) => node.id));
  const multi = useMultiSelect(order, initialSelectedId);
  return { gridRows, distinctValues, order, onIdsChange, multi };
}
