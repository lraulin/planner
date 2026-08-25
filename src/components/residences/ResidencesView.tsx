"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { ResidenceGridRow, ResidenceListRow } from "@/lib/residences/types";
import type { GridRow } from "@/lib/tree/slice";
import {
  createResidenceAction,
  deleteResidenceAction,
  listResidencesAction,
} from "@/app/library/residences/actions";
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
import { useToday } from "@/components/grid/useToday";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { spanDuration } from "@/lib/history/span";
import { isTypingTarget } from "@/lib/keyboard";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import { ResidenceDrawer } from "./ResidenceDrawer";
import {
  RESIDENCES_COLUMN_IDS,
  residencesColumns,
  type ResidencesColumnCtx,
} from "./residencesColumns";

const RESIDENCE_VIEWS = [{ id: "all", label: "All Residences" }] as const;

function viewDefaults(): GridDefaults {
  return {
    order: [...RESIDENCES_COLUMN_IDS],
    sorts: [{ columnId: "movedIn", direction: "desc" }],
  };
}

function nameOf(row: ResidenceListRow): string {
  return row.city || row.label || row.streetAddress || "Untitled residence";
}

/** Where you have lived — a catalog you maintain, whose dates feed the Timeline chronology. */
export function ResidencesView({
  initialResidences,
}: {
  initialResidences: ResidenceListRow[];
}) {
  const [rows, setRows] = useState(initialResidences);
  const [seenServerRows, setSeenServerRows] = useState(initialResidences);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ResidenceListRow | null>(null);
  const [, startTransition] = useTransition();
  const { detail: openId, setDetail: setOpenId } = useViewStateUrl();
  const todayKey = useToday();

  if (initialResidences !== seenServerRows) {
    setSeenServerRows(initialResidences);
    setRows(initialResidences);
  }

  const views = useModuleViews({
    moduleId: "residences",
    builtIn: RESIDENCE_VIEWS,
    defaultViewId: "all",
    columns: residencesColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;

  // Duration is derived here, not in the query — see the same note in `JobsView`.
  const gridRows: GridRow<ResidenceGridRow>[] = useMemo(
    () =>
      rows.map((row) => ({
        kind: "node",
        id: row.id,
        depth: 0,
        node: {
          ...row,
          duration: spanDuration({ start: row.movedIn, end: row.movedOut }, todayKey),
        },
      })),
    [rows, todayKey],
  );
  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        residencesColumns,
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
      const result = await listResidencesAction();
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
      const result = await createResidenceAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.id) openDrawer(result.id);
    });
  }, [openDrawer]);

  const requestDelete = useCallback(
    (id: string) => {
      const row = rows.find((entry) => entry.id === id);
      if (row) setPendingDelete(row);
    },
    [rows],
  );

  const confirmDelete = useCallback(() => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteResidenceAction(target.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (openId === target.id) closeDrawer();
      else refresh();
    });
  }, [pendingDelete, openId, closeDrawer, refresh]);

  const capabilitiesFor = useCallback(
    (rowId: string | null, count: number) =>
      catalogCapabilities({
        createLabel: "New residence",
        openLabel: "Open residence",
        selection: {
          id: rowId,
          count,
          label: (() => {
            const row = rows.find((entry) => entry.id === rowId);
            return row ? nameOf(row) : null;
          })(),
        },
        onCreate: createNew,
        onOpen: openDrawer,
        onDelete: (ids) => {
          if (ids[0]) requestDelete(ids[0]);
        },
        onSelectAll: selectAll,
      }),
    [rows, createNew, openDrawer, requestDelete, selectAll],
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
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openId, pendingDelete, move]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Residences"
        allColumns={residencesColumns}
        distinctValues={distinctValues}
        counts={counts}
        error={error}
        views={views}
        commandCapabilities={commandCapabilities}
      />

      <DataGrid<ResidencesColumnCtx, ResidenceGridRow>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={residencesColumns}
        columnCtx={{}}
        selectedId={selectedId}
        selectedIds={selectedIds}
        selectAllState={headerState}
        onToggleSelectAll={toggleSelectAll}
        onSelect={select}
        onOpenDetail={openDrawer}
        ariaLabel="Residences"
        rowMenu={rowMenu}
        rowLabel={(row) => nameOf(row.node)}
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
            <p>No residences yet.</p>
            <p className="text-[0.8125rem] text-ink-faint">
              Every place you add with dates shows up on the Timeline.
            </p>
          </div>
        }
      />

      <ResidenceDrawer residenceId={openId} onClose={closeDrawer} onChanged={refresh} />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this residence?"
        message={`"${pendingDelete ? nameOf(pendingDelete) : ""}" will be removed, along with its dates on the Timeline.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
