"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { HouseListRow } from "@/lib/houses/types";
import type { GridRow } from "@/lib/tree/slice";
import {
  createHouseAction,
  deleteHouseAction,
  listHousesAction,
  refreshHouseRouteAction,
} from "@/app/library/houses/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { DataGrid } from "@/components/grid/DataGrid";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { rowMenuFor } from "@/components/grid/rowMenu";
import { catalogCapabilities } from "@/components/grid/catalogCommands";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { useModuleViews } from "@/components/grid/useModuleViews";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { isTypingTarget } from "@/lib/keyboard";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import { HouseDrawer } from "./HouseDrawer";
import {
  HOUSES_COLUMN_IDS,
  housesColumns,
  type HousesColumnCtx,
} from "./housesColumns";

const HOUSE_VIEWS = [{ id: "all", label: "All Houses" }] as const;

function viewDefaults(): GridDefaults {
  return { order: [...HOUSES_COLUMN_IDS] };
}

/** House-shopping comparison grid — a small maintained catalog, not a working queue. */
export function HousesView({ initialHouses }: { initialHouses: HouseListRow[] }) {
  const [rows, setRows] = useState(initialHouses);
  const [seenServerRows, setSeenServerRows] = useState(initialHouses);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HouseListRow | null>(null);
  const [, startTransition] = useTransition();
  const { detail: openId, setDetail: setOpenId } = useViewStateUrl();

  if (initialHouses !== seenServerRows) {
    setSeenServerRows(initialHouses);
    setRows(initialHouses);
  }

  const views = useModuleViews({
    moduleId: "houses",
    builtIn: HOUSE_VIEWS,
    defaultViewId: "all",
    columns: housesColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;

  const gridRows: GridRow<HouseListRow>[] = useMemo(
    () => rows.map((row) => ({ kind: "node", id: row.id, node: row, depth: 0 })),
    [rows],
  );
  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        housesColumns,
        gridRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [gridRows],
  );
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const { order, onIdsChange } = useNavigableIds(rowIds);
  const multi = useMultiSelect(order, null);
  const {
    selectedId,
    selectedIds,
    select,
    selectAll,
    toggleSelectAll,
    headerState,
    move,
  } = multi;
  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await listHousesAction();
      if (result.ok) setRows(result.data);
      else setError(result.error);
    });
  }, []);
  const openDrawer = useCallback((id: string) => setOpenId(id), [setOpenId]);
  const closeDrawer = useCallback(() => {
    setOpenId(null);
    refresh();
  }, [setOpenId, refresh]);

  const createNew = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await createHouseAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.id) openDrawer(result.id);
    });
  }, [openDrawer]);
  const confirmDelete = useCallback(() => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteHouseAction(target.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (openId === target.id) closeDrawer();
      else refresh();
    });
  }, [pendingDelete, openId, closeDrawer, refresh]);

  const requestDelete = useCallback(
    (id: string) => {
      const row = rows.find((entry) => entry.id === id);
      if (row) setPendingDelete(row);
    },
    [rows],
  );

  const recalculateDriveTime = useCallback(
    (id: string) => {
      setError(null);
      startTransition(async () => {
        const result = await refreshHouseRouteAction(id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        refresh();
      });
    },
    [refresh],
  );

  const capabilitiesFor = useCallback(
    (rowId: string | null, count: number) =>
      catalogCapabilities({
        createLabel: "New house",
        openLabel: "Open house",
        selection: {
          id: rowId,
          count,
          label: rows.find((entry) => entry.id === rowId)?.nickname,
        },
        onCreate: createNew,
        onOpen: openDrawer,
        onDelete: (ids) => {
          if (ids[0]) requestDelete(ids[0]);
        },
        onSelectAll: selectAll,
        pageCommands:
          rowId && count <= 1
            ? [
                {
                  id: "houses.recalculateDriveTime",
                  label: "Recalculate drive time",
                  group: "record",
                  menu: "item",
                  section: "Item",
                  rowMenu: true,
                  run: () => recalculateDriveTime(rowId),
                },
              ]
            : [],
      }),
    [rows, createNew, openDrawer, requestDelete, selectAll, recalculateDriveTime],
  );

  const commandCapabilities = useMemo(
    () => capabilitiesFor(selectedId, selectedIds.size),
    [capabilitiesFor, selectedId, selectedIds.size],
  );

  const rowMenu = useCallback(
    // `null` is the blank area below the rows — the same menu with nothing selected.
    (id: string | null): MenuItem[] => rowMenuFor(capabilitiesFor(id, id ? 1 : 0)),
    [capabilitiesFor],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (openId || pendingDelete || isTypingTarget(event.target)) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1, event.shiftKey);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1, event.shiftKey);
        return;
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openId, pendingDelete, move]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Houses"
        allColumns={housesColumns}
        distinctValues={distinctValues}
        counts={counts}
        error={error}
        views={views}
        commandCapabilities={commandCapabilities}
      />

      <DataGrid<HousesColumnCtx, HouseListRow>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={housesColumns}
        columnCtx={{}}
        selectedId={selectedId}
        selectedIds={selectedIds}
        selectAllState={headerState}
        onToggleSelectAll={toggleSelectAll}
        onSelect={select}
        onOpenDetail={openDrawer}
        ariaLabel="Houses"
        rowMenu={rowMenu}
        rowLabel={(row) =>
          row.node.nickname || row.node.streetAddress || "Untitled house"
        }
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
        empty={
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-[0.9375rem] text-ink-muted">
            <p>No houses yet.</p>
            <p className="text-[0.8125rem] text-ink-faint">
              Add a listing to start comparing it against the rest.
            </p>
          </div>
        }
      />

      <HouseDrawer houseId={openId} onClose={closeDrawer} onChanged={refresh} />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this house?"
        message={`"${pendingDelete?.nickname || pendingDelete?.streetAddress || "This house"}" will be removed.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
