"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ChronologyRow } from "@/lib/timeline/types";
import type { GridRow } from "@/lib/tree/slice";
import {
  createLifeEventAction,
  deleteLifeEventAction,
  listChronologyAction,
  updateLifeEventAction,
} from "@/app/library/timeline/actions";
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
import { isTypingTarget } from "@/lib/keyboard";
import { localDateKey } from "@/lib/schedule/geometry";
import {
  TIMELINE_COLUMN_IDS,
  timelineColumns,
  type TimelineColumnCtx,
} from "./timelineColumns";

const TIMELINE_VIEWS = [{ id: "all", label: "Whole Timeline" }] as const;

function viewDefaults(): GridDefaults {
  return {
    order: [...TIMELINE_COLUMN_IDS],
    // Oldest first. A life reads that way, and the grid's own sort can flip it.
    sorts: [{ columnId: "date", direction: "asc" }],
  };
}

/** Where a derived row is actually edited. */
const SOURCE_PAGES = {
  job: { href: "/library/jobs", label: "Jobs" },
  residence: { href: "/library/residences", label: "Residences" },
} as const;

/**
 * The chronology of everything dated: life events you type here, plus the start and end of
 * every job and residence, derived at read time.
 */
export function TimelineView({ initialRows }: { initialRows: ChronologyRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [seenServerRows, setSeenServerRows] = useState(initialRows);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChronologyRow | null>(null);
  const [, startTransition] = useTransition();
  const todayKey = useToday();

  if (initialRows !== seenServerRows) {
    setSeenServerRows(initialRows);
    setRows(initialRows);
  }

  const views = useModuleViews({
    moduleId: "timeline",
    builtIn: TIMELINE_VIEWS,
    defaultViewId: "all",
    columns: timelineColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;

  const gridRows: GridRow<ChronologyRow>[] = useMemo(
    () => rows.map((row) => ({ kind: "node", id: row.id, node: row, depth: 0 })),
    [rows],
  );
  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        timelineColumns,
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
      const result = await listChronologyAction();
      if (result.ok) setRows(result.data);
      else setError(result.error);
    });
  }, []);

  const editEvent = useCallback(
    (eventId: string, patch: { title?: string; category?: string; notes?: string }) => {
      setError(null);
      startTransition(async () => {
        const result = await updateLifeEventAction(eventId, patch);
        if (!result.ok) setError(result.error);
        else refresh();
      });
    },
    [refresh],
  );

  const editEventDate = useCallback(
    (eventId: string, dateKey: string) => {
      setError(null);
      startTransition(async () => {
        const result = await updateLifeEventAction(eventId, { eventDate: dateKey });
        if (!result.ok) setError(result.error);
        else refresh();
      });
    },
    [refresh],
  );

  const columnCtx: TimelineColumnCtx = useMemo(
    () => ({ todayKey, onEditEvent: editEvent, onEditEventDate: editEventDate }),
    [todayKey, editEvent, editEventDate],
  );

  /**
   * A new event is dated today and titled nothing — you type the title straight into the row.
   * `localDateKey` rather than the server's idea of today, which on Vercel is UTC's.
   */
  const createNew = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await createLifeEventAction({
        eventDate: localDateKey(new Date()),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      refresh();
      if (result.id) select(`event:${result.id}`);
    });
  }, [refresh, select]);

  const rowById = useCallback(
    (id: string | null) => rows.find((entry) => entry.id === id) ?? null,
    [rows],
  );

  /**
   * Open means different things per row. A life event is already open — it edits in the
   * grid — so Open is only meaningful on a derived row, where it takes you to the record on
   * its own page via `?detail=`, the same deep link Contacts and the outline use.
   */
  const openRow = useCallback(
    (id: string) => {
      const row = rowById(id);
      if (!row || row.source === "event" || !row.sourceId) return;
      router.push(`${SOURCE_PAGES[row.source].href}?detail=${row.sourceId}`);
    },
    [rowById, router],
  );

  const requestDelete = useCallback(
    (id: string) => {
      const row = rowById(id);
      if (row?.source === "event") setPendingDelete(row);
    },
    [rowById],
  );

  const confirmDelete = useCallback(() => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteLifeEventAction(target.id.slice("event:".length));
      if (!result.ok) setError(result.error);
      else refresh();
    });
  }, [pendingDelete, refresh]);

  const capabilitiesFor = useCallback(
    (rowId: string | null, count: number) => {
      const row = rowById(rowId);
      // `navigation.md`: unavailable is disabled with the specific reason, never absent.
      // A derived row is a view of a job or a residence, and is edited where it lives.
      const derived = row && row.source !== "event" ? SOURCE_PAGES[row.source] : null;
      return catalogCapabilities({
        createLabel: "New event",
        openLabel: derived ? `Open on ${derived.label}` : "Open record",
        deleteLabel: "Delete event",
        deleteDisabled: derived
          ? `This date comes from a record on ${derived.label}. Delete it there.`
          : row
            ? undefined
            : "Select a row first",
        selection: { id: rowId, count, label: row?.title },
        onCreate: createNew,
        onOpen: openRow,
        onDelete: requestDelete,
      });
    },
    [rowById, createNew, openRow, requestDelete],
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
      if (pendingDelete || isTypingTarget(event.target)) return;
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
  }, [pendingDelete, move]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Timeline"
        allColumns={timelineColumns}
        distinctValues={distinctValues}
        counts={counts}
        error={error}
        views={views}
        commandCapabilities={commandCapabilities}
      />

      <DataGrid<TimelineColumnCtx, ChronologyRow>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={timelineColumns}
        columnCtx={columnCtx}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelect={select}
        onOpenDetail={openRow}
        ariaLabel="Timeline"
        rowMenu={rowMenu}
        rowNumbers
        rowLabel={(row) => row.node.title || "Untitled event"}
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
            <p>Nothing on the timeline yet.</p>
            <p className="text-[0.8125rem] text-ink-faint">
              Add an event here, or add a job or residence — their dates appear on this
              page automatically.
            </p>
          </div>
        }
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this event?"
        message={`"${pendingDelete?.title ?? ""}" will be removed from the timeline.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
