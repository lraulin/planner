"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { rowMenuFor } from "@/components/grid/rowMenu";
import type { useModuleViews } from "@/components/grid/useModuleViews";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { OPEN_RECORD } from "@/lib/commands/chords";
import type { GridCommandCapabilities } from "@/lib/grid/commandDeck";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { resultTarget } from "@/lib/find/targets";
import type { FindResult } from "@/lib/find/types";
import { isTypingTarget } from "@/lib/keyboard";
import type { GridRow } from "@/lib/tree/slice";
import { findColumns, type FindColumn, type FindColumnCtx } from "./findColumns";

/**
 * The results half of Advanced Find.
 *
 * Split from `FindView` so it can be **remounted on every search**. A new search is a new
 * result set: it has to start at the top with nothing selected, and both of those live inside
 * this subtree (the scroll offset in `DataGrid`'s scroller, the selection in
 * `useMultiSelect`). Without the remount a row that happens to survive two searches stays
 * focused, and the grid scrolls two hundred rows down to show it — which reads as the page
 * having ignored the search.
 *
 * The grid's own view state does **not** reset, because it lives in `user_settings` and is
 * passed in.
 */
export function FindResults({
  results,
  views,
  emptyState,
}: {
  results: readonly FindResult[];
  /**
   * Typed against this grid's own columns, not the bare `ModuleViewsApi`: that alias erases
   * the column type to `ColumnMeta`, and `DataGrid` needs the definitions with their
   * renderers.
   */
  views: ReturnType<typeof useModuleViews<FindColumn, "all">>;
  emptyState: React.ReactNode;
}) {
  const router = useRouter();
  const gridState = views.grid;
  const [counts, setCounts] = useState({ shown: 0, total: 0 });

  const gridRows: GridRow<FindResult>[] = useMemo(
    () =>
      results.map((result) => ({
        kind: "node",
        id: result.id,
        depth: 0,
        node: result,
      })),
    [results],
  );
  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        findColumns,
        gridRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [gridRows],
  );

  const rowIds = useMemo(() => results.map((result) => result.id), [results]);
  const { order, onIdsChange } = useNavigableIds(rowIds);
  const { selectedId, selectedIds, select, toggleSelectAll, headerState, move } =
    useMultiSelect(order, null);

  const byId = useMemo(
    () => new Map(results.map((result) => [result.id, result])),
    [results],
  );

  const open = useCallback(
    (rowId: string) => {
      const result = byId.get(rowId);
      if (result) router.push(resultTarget(result).href);
    },
    [byId, router],
  );

  /**
   * One verb, published as a command rather than written into a row menu.
   *
   * `navigation.md`: a command declares its own placement and binding, and every surface reads
   * the registry. That is what puts Open in the Item menu, the Commands panel, `⌘K` and the
   * phone `⋯` as well as the row menu — and it is why the row menu is not hand-written, which
   * is the drift eight views used to produce.
   *
   * No New and no Delete: a result is somebody else's record, edited where it lives.
   * `catalogCapabilities` would have supplied all three.
   */
  const capabilitiesFor = useCallback(
    (rowId: string | null, count: number): GridCommandCapabilities => {
      const result = rowId ? byId.get(rowId) : null;
      const target = result ? resultTarget(result) : null;
      return {
        selection: { id: rowId, count, label: result?.name },
        actions: {},
        pageCommands: [
          {
            id: "record.open",
            // Kept for a kind that can only land on its page. Every kind opens today;
            // a new one that cannot should not inherit a command that lies.
            label: target && !target.opens ? "Show where it lives" : "Open",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "open",
            toolbar: 50,
            rowMenu: true,
            bindings: OPEN_RECORD,
            disabled: rowId === null,
            title: rowId === null ? "Select a result first" : undefined,
            run: () => {
              if (rowId) open(rowId);
            },
          },
        ],
      };
    },
    [byId, open],
  );

  const commandCapabilities = useMemo(
    () => capabilitiesFor(selectedId, selectedIds.size),
    [capabilitiesFor, selectedId, selectedIds.size],
  );

  const rowMenu = useCallback(
    // `null` is the blank area below the rows — the same menu with nothing selected.
    (rowId: string | null): MenuItem[] =>
      rowMenuFor(capabilitiesFor(rowId, rowId ? 1 : 0)),
    [capabilitiesFor],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1, event.shiftKey);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1, event.shiftKey);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [move]);

  return (
    <>
      <GridToolbar
        grid={gridState}
        gridLabel="Results"
        allColumns={findColumns}
        distinctValues={distinctValues}
        counts={counts}
        views={views}
        commandCapabilities={commandCapabilities}
      />

      <DataGrid<FindColumnCtx, FindResult>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={findColumns}
        columnCtx={{}}
        selectedId={selectedId}
        selectedIds={selectedIds}
        selectAllState={headerState}
        onToggleSelectAll={toggleSelectAll}
        onSelect={select}
        onOpenDetail={open}
        ariaLabel="Search results"
        rowMenu={rowMenu}
        rowLabel={(row) => row.node.name}
        enableFilters
        enableSort
        sorts={gridState.sorts}
        onSortChange={gridState.toggleSort}
        onSetSort={gridState.setSort}
        filters={gridState.filters}
        onFilterChange={gridState.setFilter}
        advancedFilter={gridState.advancedFilter}
        search={gridState.search}
        distinctValues={distinctValues}
        onCountsChange={setCounts}
        onNavigableIdsChange={onIdsChange}
        widths={gridState.widths}
        onResizeColumn={gridState.setWidth}
        onResetColumnWidth={gridState.clearWidth}
        columnControls={gridState.columnControls}
        collapsedGroups={gridState.collapsedGroups}
        onToggleGroup={gridState.toggleGroup}
        density={gridState.density}
        empty={emptyState}
      />
    </>
  );
}
