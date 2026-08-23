"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GridRow } from "@/lib/tree/slice";
import {
  completeScheduleAction,
  deleteScheduleAction,
  discoverSchedulesAction,
  getScheduleAction,
  listSchedulesAction,
  postScheduleNowAction,
  skipScheduleAction,
} from "@/app/finances/actions";
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
import { useToday } from "@/components/grid/useToday";
import type { FinanceAccountRow } from "@/lib/finances/types";
import type { BudgetEnvelopeOption } from "@/lib/finances/budget/queries";
import type { ScheduleListRow } from "@/lib/finances/schedules/queries";
import type { ScheduleRecord } from "@/lib/finances/schedules/queries";
import type { DiscoverProposal } from "@/lib/finances/schedules/discover";
import { DEFAULT_UPCOMING_LENGTH } from "@/lib/finances/schedules/status";
import {
  SCHEDULE_COLUMN_IDS,
  scheduleColumns,
  type ScheduleColumnCtx,
} from "./scheduleColumns";
import { NEW_SCHEDULE_ID, ScheduleDrawer } from "./ScheduleDrawer";
import { DiscoverDialog } from "./DiscoverDialog";

const SCHEDULE_VIEWS = [{ id: "all", label: "All Schedules" }] as const;

function viewDefaults(): GridDefaults {
  return {
    order: [...SCHEDULE_COLUMN_IDS],
    sorts: [{ columnId: "nextDate", direction: "asc" }],
  };
}

export function SchedulesView({
  initialRows,
  accounts,
  payees,
  envelopes,
}: {
  initialRows: ScheduleListRow[];
  accounts: FinanceAccountRow[];
  payees: { id: string; name: string }[];
  envelopes: BudgetEnvelopeOption[];
}) {
  const router = useRouter();
  const today = useToday();
  const [rows, setRows] = useState(initialRows);
  const [seenServerRows, setSeenServerRows] = useState(initialRows);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ScheduleListRow | null>(null);
  const [discover, setDiscover] = useState<DiscoverProposal[] | null>(null);
  const [openRecord, setOpenRecord] = useState<ScheduleRecord | null>(null);
  const [, startTransition] = useTransition();
  const { detail: openId, setDetail: setOpenId } = useViewStateUrl();

  if (initialRows !== seenServerRows) {
    setSeenServerRows(initialRows);
    setRows(initialRows);
  }

  const views = useModuleViews({
    moduleId: "finance-schedules",
    builtIn: SCHEDULE_VIEWS,
    defaultViewId: "all",
    columns: scheduleColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;

  const gridRows: GridRow<ScheduleListRow>[] = useMemo(
    () => rows.map((node) => ({ kind: "node" as const, id: node.id, node, depth: 0 })),
    [rows],
  );
  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        scheduleColumns,
        gridRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [gridRows],
  );
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const { order, onIdsChange } = useNavigableIds(rowIds);
  const multi = useMultiSelect(order, null);
  const { selectedId, selectedIds, select, move } = multi;

  const refresh = useCallback(() => {
    if (!today) return;
    startTransition(async () => {
      const result = await listSchedulesAction(today, DEFAULT_UPCOMING_LENGTH);
      if (result.ok) setRows(result.data);
      else setError(result.error);
    });
  }, [today]);

  useEffect(() => {
    if (today) refresh();
  }, [today, refresh]);

  const creating = openId === NEW_SCHEDULE_ID;

  const openDrawer = useCallback(
    (id: string) => {
      if (id === NEW_SCHEDULE_ID) {
        setOpenRecord(null);
        setOpenId(NEW_SCHEDULE_ID);
        return;
      }
      startTransition(async () => {
        const result = await getScheduleAction(id);
        if (result.ok) {
          setOpenRecord(result.data);
          setOpenId(id);
        } else setError(result.error);
      });
    },
    [setOpenId],
  );

  const closeDrawer = useCallback(() => {
    setOpenId(null);
    setOpenRecord(null);
    refresh();
  }, [setOpenId, refresh]);

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
      const result = await deleteScheduleAction(target.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (openId === target.id) closeDrawer();
      else refresh();
    });
  }, [pendingDelete, openId, closeDrawer, refresh]);

  const runOnRow = useCallback(
    (
      id: string | null,
      action: (rowId: string) => Promise<{ ok: boolean; error?: string }>,
    ) => {
      if (!id) return;
      setError(null);
      startTransition(async () => {
        const result = await action(id);
        if (!result.ok) setError(result.error ?? "Something went wrong.");
        else refresh();
      });
    },
    [refresh],
  );

  const openDiscover = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await discoverSchedulesAction();
      if (!result.ok) setError(result.error);
      else setDiscover(result.data);
    });
  }, []);

  const capabilitiesFor = useCallback(
    (rowId: string | null, count: number) => {
      const row = rowId ? rows.find((entry) => entry.id === rowId) : undefined;
      const noAccount =
        row && !row.accountId ? "Pick an account on the schedule first." : undefined;
      return catalogCapabilities({
        createLabel: "New schedule",
        openLabel: "Open schedule",
        selection: { id: rowId, count, label: row?.name },
        onCreate: () => openDrawer(NEW_SCHEDULE_ID),
        onOpen: openDrawer,
        onDelete: requestDelete,
        pageCommands: [
          {
            id: "tools.import-schedules-from-bills",
            label: "Import from bills…",
            group: "app",
            menu: "tools",
            section: "Schedules",
            icon: "convert",
            keywords: "import bills commitments seed",
            run: () => router.push("/finances/budget?import=commitments"),
          },
          {
            id: "tools.discover-schedules",
            label: "Discover…",
            group: "app",
            menu: "tools",
            section: "Schedules",
            icon: "filter",
            keywords: "discover find recurring history",
            run: openDiscover,
          },
          {
            id: "record.post-schedule",
            label: "Post now",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "new",
            rowMenu: true,
            disabled: Boolean(!rowId || noAccount),
            title: !rowId ? "Select a row first" : noAccount,
            run: () => runOnRow(rowId, postScheduleNowAction),
          },
          {
            id: "record.skip-schedule",
            label: "Skip next date",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "move-down",
            rowMenu: true,
            disabled: !rowId,
            title: rowId ? undefined : "Select a row first",
            run: () => runOnRow(rowId, skipScheduleAction),
          },
          {
            id: "record.complete-schedule",
            label: row?.completed ? "Reopen" : "Complete",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "convert",
            rowMenu: true,
            disabled: !rowId,
            title: rowId ? undefined : "Select a row first",
            run: () => {
              if (!rowId || !row) return;
              runOnRow(rowId, (id) => completeScheduleAction(id, !row.completed));
            },
          },
        ],
      });
    },
    [rows, openDrawer, requestDelete, openDiscover, runOnRow, router],
  );

  const commandCapabilities = useMemo(
    () => capabilitiesFor(selectedId, selectedIds.size),
    [capabilitiesFor, selectedId, selectedIds.size],
  );

  const rowMenu = useCallback(
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
        gridLabel="Schedules"
        allColumns={scheduleColumns}
        distinctValues={distinctValues}
        counts={counts}
        error={error}
        views={views}
        commandCapabilities={commandCapabilities}
      />
      <DataGrid<ScheduleColumnCtx, ScheduleListRow>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={scheduleColumns}
        columnCtx={{}}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelect={select}
        onOpenDetail={openDrawer}
        ariaLabel="Schedules"
        rowMenu={rowMenu}
        rowNumbers
        rowLabel={(row) => row.node.name || "Schedule"}
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
          <div className="mx-auto w-full max-w-2xl p-6">
            <p className="mb-4 text-center text-[0.9375rem] text-ink-muted">
              No schedules yet. Import from the bills you have already declared, or
              create one.
            </p>
          </div>
        }
      />
      {(creating || openRecord) && (
        <ScheduleDrawer
          record={openRecord}
          creating={creating}
          accounts={accounts}
          payees={payees}
          envelopes={envelopes}
          onClose={closeDrawer}
          onChanged={refresh}
        />
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete schedule?"
        message={
          pendingDelete
            ? `Delete ${pendingDelete.name}? Linked transactions stay in the register.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      {discover !== null ? (
        <DiscoverDialog
          open
          proposals={discover}
          onClose={() => setDiscover(null)}
          onCreated={refresh}
        />
      ) : null}
    </div>
  );
}
