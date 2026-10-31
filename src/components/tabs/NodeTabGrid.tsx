"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { NodeKind } from "@/lib/tree/hierarchy";
import type { GridRow, GroupBy } from "@/lib/tree/slice";
import { collectDistinctValues } from "@/lib/grid/distinct";
import type { ColumnDef } from "@/components/grid/columns";
import { CascadeConfirm } from "@/components/grid/CascadeConfirm";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridToolbar, type GridSwitch } from "@/components/grid/GridToolbar";
import type { ModuleViewsApi } from "@/components/grid/useModuleViews";
import { useNodeCommandDeck } from "@/components/grid/useNodeCommandDeck";
import { useTreeRowDrag } from "@/components/grid/useTreeRowDrag";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import type { OutlineColumnCtx } from "@/components/outline/outlineColumns";
import type { useGridTab } from "./useGridTab";

type GridTab = ReturnType<typeof useGridTab>;
type NodeCommandDeck = ReturnType<typeof useNodeCommandDeck>;

/**
 * The command deck every node tab wires the same way: its rows, its selection, and the
 * create button for the kinds it makes, filed under `parentId` when the tab is narrowed.
 */
export function useNodeTabCommands(
  tab: GridTab,
  create: { kinds: readonly NodeKind[]; parentId?: string | null },
): NodeCommandDeck {
  return useNodeCommandDeck({
    nodes: tab.nodes,
    selectedId: tab.selectedId,
    selectedIds: tab.selectedIds,
    apply: tab.apply,
    create: { ...create, child: true, onCreated: tab.startNaming },
    onOpen: tab.openDetail,
    onRename: tab.setEditingId,
    onCopyAsText: tab.copySelectionAsText,
    onSelectAll: tab.selectAll,
    onStateChange: tab.cellHandlers.onStateChange,
  });
}

/**
 * The page of a node tab — Result Areas, Goals, Projects, Tasks: toolbar, the tree-sliced
 * grid with the outline's drag, the cascade confirm and the node drawer. Each tab supplies
 * what is its own (columns, rows, toolbar selects, a banner) and this lays it out the same
 * way for all four.
 */
export function NodeTabGrid<TCtx extends OutlineColumnCtx>({
  tab,
  commands,
  views,
  label,
  noun,
  allColumns,
  columnCtx,
  rows,
  narrowingRows,
  groupDimensions,
  switches,
  left,
  banner,
}: {
  tab: GridTab;
  commands: NodeCommandDeck;
  /** From `useModuleViews` over `allColumns`, so its visible columns are this tab's. */
  views: ModuleViewsApi & { grid: { columns: ColumnDef<TCtx>[] } };
  /** Names the grid: toolbar, filter dialog and screen readers. */
  label: string;
  /** Plural, lower case, for the empty state: "No goals match this view." */
  noun: string;
  allColumns: ColumnDef<TCtx>[];
  columnCtx: TCtx;
  rows: GridRow[];
  narrowingRows: GridRow[];
  groupDimensions: readonly GroupBy[];
  switches?: readonly GridSwitch[];
  left?: ReactNode;
  /** Drawn between the toolbar and the grid — the Tasks tab's Project's Purpose. */
  banner?: ReactNode;
}) {
  const gridState = views.grid;
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [groupIds, setGroupIds] = useState<string[]>([]);
  // Every node tab nests and ranks rows the way the outline does: a structural move plus a
  // sibling priority renumber.
  const rowDrag = useTreeRowDrag({
    nodes: tab.nodes,
    byId: tab.byId,
    apply: tab.apply,
    patch: tab.patch,
    selectOne: tab.selectOne,
    headerSorts: gridState.sorts,
    clearHeaderSort: gridState.clearSort,
  });
  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        allColumns,
        narrowingRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [allColumns, narrowingRows],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel={label}
        allColumns={allColumns}
        distinctValues={distinctValues}
        groupDimensions={groupDimensions}
        groupIds={groupIds}
        switches={switches}
        counts={counts}
        error={tab.error}
        views={views}
        left={left}
        commandCapabilities={commands.capabilities}
      />

      {commands.dialogs}

      {banner}

      <DataGrid
        rows={rows}
        narrowingRows={narrowingRows}
        columns={gridState.columns}
        allColumns={allColumns}
        columnCtx={columnCtx}
        selectedId={tab.selectedId}
        selectedIds={tab.selectedIds}
        selectAllState={tab.headerState}
        onToggleSelectAll={tab.toggleSelectAll}
        gutter="handle"
        rowDrag={rowDrag}
        onSelect={tab.select}
        onOpenDetail={tab.openDetail}
        ariaLabel={label}
        onNavigableIdsChange={tab.setNavigableIds}
        rowMenu={commands.rowMenu}
        rowSwipe={commands.rowSwipe}
        enableFilters
        enableSort
        grid={gridState}
        distinctValues={distinctValues}
        onCountsChange={setCounts}
        onGroupIdsChange={setGroupIds}
        empty={
          <div className="flex h-full items-center justify-center p-8 text-[0.9375rem] text-ink-muted">
            No {noun} match this view.
          </div>
        }
      />

      <CascadeConfirm state={tab.stateChange} />

      <NodeDetailDrawer
        node={tab.detailNode}
        nodes={tab.nodes}
        onClose={() => tab.setDetailId(null)}
      />
    </div>
  );
}
