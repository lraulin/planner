"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { ContactOption } from "@/lib/contacts/types";
import type { ResourceListRow } from "@/lib/resources/types";
import type { GridRow } from "@/lib/tree/slice";
import {
  createResourceAction,
  deleteResourceAction,
  listResourcesAction,
} from "@/app/library/resources/actions";
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
import { ResourceDrawer } from "./ResourceDrawer";
import {
  RESOURCES_COLUMN_IDS,
  resourcesColumns,
  type ResourcesColumnCtx,
} from "./resourcesColumns";

const RESOURCE_VIEWS = [{ id: "all", label: "All Resources" }] as const;

function viewDefaults(): GridDefaults {
  return { order: [...RESOURCES_COLUMN_IDS] };
}

/** Resources list — a small maintained catalog rather than a second schedule surface. */
export function ResourcesView({
  initialResources,
  contacts,
}: {
  initialResources: ResourceListRow[];
  contacts: ContactOption[];
}) {
  const [rows, setRows] = useState(initialResources);
  const [seenServerRows, setSeenServerRows] = useState(initialResources);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ResourceListRow | null>(null);
  const [, startTransition] = useTransition();
  const { detail: openId, setDetail: setOpenId } = useViewStateUrl();

  if (initialResources !== seenServerRows) {
    setSeenServerRows(initialResources);
    setRows(initialResources);
  }

  const views = useModuleViews({
    moduleId: "resources",
    defaultViews: RESOURCE_VIEWS,
    defaultViewId: "all",
    columns: resourcesColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;

  const gridRows: GridRow<ResourceListRow>[] = useMemo(
    () => rows.map((row) => ({ kind: "node", id: row.id, node: row, depth: 0 })),
    [rows],
  );
  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        resourcesColumns,
        gridRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [gridRows],
  );
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const { order, onIdsChange } = useNavigableIds(rowIds);
  const multi = useMultiSelect(order, null);
  const { selectedId, selectedIds, select, move } = multi;
  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await listResourcesAction();
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
      const result = await createResourceAction();
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
      const result = await deleteResourceAction(target.id);
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

  const capabilitiesFor = useCallback(
    (rowId: string | null, count: number) =>
      catalogCapabilities({
        createLabel: "New resource",
        openLabel: "Open resource",
        selection: {
          id: rowId,
          count,
          label: rows.find((entry) => entry.id === rowId)?.shortName,
        },
        onCreate: createNew,
        onOpen: openDrawer,
        onDelete: requestDelete,
      }),
    [rows, createNew, openDrawer, requestDelete],
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
        gridLabel="Resources"
        allColumns={resourcesColumns}
        distinctValues={distinctValues}
        counts={counts}
        error={error}
        views={views}
        commandCapabilities={commandCapabilities}
      />

      <DataGrid<ResourcesColumnCtx, ResourceListRow>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={resourcesColumns}
        columnCtx={{}}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelect={select}
        onOpenDetail={openDrawer}
        ariaLabel="Resources"
        rowMenu={rowMenu}
        rowNumbers
        rowLabel={(row) => row.node.shortName || "Untitled resource"}
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
            <p>No resources yet.</p>
            <p className="text-[0.8125rem] text-ink-faint">
              Add the people or pools of capacity you plan your week around.
            </p>
          </div>
        }
      />

      <ResourceDrawer
        resourceId={openId}
        contacts={contacts}
        onClose={closeDrawer}
        onChanged={refresh}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this resource?"
        message={`"${pendingDelete?.shortName ?? ""}" will be removed. Existing weekly plans keep the capacity already saved to them.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
