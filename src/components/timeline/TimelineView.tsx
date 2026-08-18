"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ChronologyRow } from "@/lib/timeline/types";
import type { Ribbon, RibbonBar, RibbonPin } from "@/lib/timeline/ribbon";
import type { GridRow } from "@/lib/tree/slice";
import {
  createLifeEventAction,
  deleteLifeEventAction,
  listTimelineAction,
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
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import {
  ErrorBanner,
  TabToolbar,
  ToolbarButton,
  ToolbarSegments,
} from "@/components/tabs/tabChrome";
import { useSetting, type SettingCodec } from "@/components/settings/SettingsProvider";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { isTypingTarget } from "@/lib/keyboard";
import { localDateKey } from "@/lib/schedule/geometry";
import { TIMELINE_SCOPE } from "@/lib/settings/scopes";
import {
  parseTimelineSettings,
  serializeTimelineSettings,
  type TimelinePresentation,
  type TimelineSettings,
  type TimelineWindow,
} from "@/lib/settings/timeline";
import { TimelineRibbon } from "./TimelineRibbon";
import {
  TIMELINE_COLUMN_IDS,
  timelineColumns,
  type TimelineColumnCtx,
} from "./timelineColumns";

const TIMELINE_VIEWS = [{ id: "all", label: "Whole Timeline" }] as const;

const TIMELINE_CODEC: SettingCodec<TimelineSettings> = {
  parse: parseTimelineSettings,
  serialize: serializeTimelineSettings,
};

const PRESENTATIONS = [
  {
    value: "grid" as TimelinePresentation,
    label: "Grid",
    title: "The chronology: one row per date, and where events are edited",
  },
  {
    value: "ribbon" as TimelinePresentation,
    label: "Timeline",
    title: "The picture: how long each job and address lasted, and what overlapped",
  },
];

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
 * Everything dated: life events you type here, plus the start and end of every job and
 * residence, derived at read time — drawn either as a chronology or as a ribbon of spans.
 *
 * **The two presentations are one page, not two routes.** Both come from the same three queries
 * (`loadLifeHistory`), derived on the server into the two payloads below, so flipping between
 * them costs nothing. Notes split `Grid | Journal` into routes because its two presentations
 * needed *different* reads and a client-side mode made every visit pay for both; that argument
 * does not reach here. The choice persists in the `timeline` settings scope, so it survives a
 * reload the way a remembered page does.
 */
export function TimelineView({
  initialRows,
  initialRibbon,
}: {
  initialRows: ChronologyRow[];
  initialRibbon: Ribbon;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [ribbon, setRibbon] = useState(initialRibbon);
  const [seenServerRows, setSeenServerRows] = useState(initialRows);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChronologyRow | null>(null);
  const [, startTransition] = useTransition();
  const todayKey = useToday();
  const { detail: openId, setDetail: setOpenId } = useViewStateUrl();
  const { value: settings, patch: patchSettings } = useSetting(
    TIMELINE_SCOPE,
    TIMELINE_CODEC,
  );
  const presentation = settings.presentation;

  if (initialRows !== seenServerRows) {
    setSeenServerRows(initialRows);
    setRows(initialRows);
    setRibbon(initialRibbon);
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
  const eventRowId = openId ? `event:${openId}` : null;
  const multi = useMultiSelect(order, eventRowId);
  const { selectedId, selectedIds, select, selectOne, move } = multi;

  // Find and a pasted link land on `?detail=<life_events.id>`. The grid row is
  // `event:<id>` — prefix here so the URL matches every other catalog.
  const [seenDetailId, setSeenDetailId] = useState(openId);
  if (openId !== seenDetailId) {
    setSeenDetailId(openId);
    if (openId) selectOne(`event:${openId}`);
  }

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await listTimelineAction();
      if (result.ok) {
        setRows(result.data.rows);
        setRibbon(result.data.ribbon);
      } else setError(result.error);
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
      if (result.id) setOpenId(result.id);
    });
  }, [refresh, setOpenId]);

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
      else {
        if (openId && target.id === `event:${openId}`) setOpenId(null);
        refresh();
      }
    });
  }, [pendingDelete, refresh, openId, setOpenId]);

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
          : undefined,
        // An event has no record to open — it *is* the row, and it edits in place.
        openDisabled:
          row && !derived ? "This event edits in the grid — click a cell." : undefined,
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

  const setPresentation = useCallback(
    (next: TimelinePresentation) => {
      // The ribbon is a reading surface; `?detail=` is a grid landing. Leaving the
      // param in place would force the grid back on the next render.
      if (next === "ribbon" && openId) setOpenId(null);
      patchSettings((current) => ({ ...current, presentation: next }));
    },
    [openId, setOpenId, patchSettings],
  );

  /**
   * A Find / pasted link arrives with `?detail=` while the stored presentation may still
   * be the ribbon. Switch to the grid so the selected row is actually on screen.
   */
  useEffect(() => {
    if (openId && presentation !== "grid") {
      patchSettings((current) => ({ ...current, presentation: "grid" }));
    }
  }, [openId, presentation, patchSettings]);

  const setWindow = useCallback(
    (next: TimelineWindow | null) =>
      patchSettings((current) => ({ ...current, window: next })),
    [patchSettings],
  );

  /** A bar is a whole job or residence, so it opens the record rather than one of its dates. */
  const openBar = useCallback(
    (bar: RibbonBar) => {
      router.push(`${SOURCE_PAGES[bar.source].href}?detail=${bar.sourceId}`);
    },
    [router],
  );

  /**
   * A pin has no record behind it — a life event *is* its row — so it hands you back to the grid
   * with that row selected, which is the only place it can be edited.
   */
  const openPin = useCallback(
    (pin: RibbonPin) => {
      const eventId = pin.id.startsWith("event:")
        ? pin.id.slice("event:".length)
        : pin.id;
      setPresentation("grid");
      setOpenId(eventId);
    },
    [setPresentation, setOpenId],
  );

  const presentationToggle = (
    <ToolbarSegments
      ariaLabel="Presentation"
      options={PRESENTATIONS}
      value={presentation}
      onChange={setPresentation}
    />
  );

  const emptyState = (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-[0.9375rem] text-ink-muted">
      <p>Nothing on the timeline yet.</p>
      <p className="text-[0.8125rem] text-ink-faint">
        Add an event here, or add a job or residence — their dates appear on this page
        automatically.
      </p>
    </div>
  );

  const rowMenu = useCallback(
    (id: string | null): MenuItem[] => rowMenuFor(capabilitiesFor(id, id ? 1 : 0)),
    [capabilitiesFor],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (presentation !== "grid") return;
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
  }, [presentation, pendingDelete, move]);

  /**
   * `?detail=` is a grid landing. Honour it on the first paint so Find does not flash the
   * ribbon and then switch. The effect above persists the choice so a later visit without
   * the param still opens on the grid.
   */
  const showingGrid = presentation === "grid" || Boolean(openId);

  if (!showingGrid) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface">
        {/*
          A slim bar rather than `GridToolbar`. The ribbon is a reading surface: it has no rows to
          act on, no columns to show or hide and nothing to filter, so a command row would be a
          menu of things that are all unavailable. `New event` and every row verb live one segment
          away, on the grid, which is where an event can actually be typed.
        */}
        <TabToolbar>
          {presentationToggle}
          {/*
            The chip is the only *visible* half of the range control — dragging is the way you set
            one, which is an invisible affordance, so what is on the bar says which stretch you are
            looking at and offers the way back out. `navigation.md` does not let a state you can
            get into have no signposted exit; double-clicking the ribbon does the same thing for
            someone who has learned the gesture.
          */}
          {settings.window && (
            <ToolbarButton
              onClick={() => setWindow(null)}
              title="Back to the whole timeline"
            >
              {formatWindow(settings.window)} ✕
            </ToolbarButton>
          )}
        </TabToolbar>

        {error && <ErrorBanner message={error} />}

        <TimelineRibbon
          ribbon={ribbon}
          window={settings.window}
          onWindowChange={setWindow}
          onOpenRecord={openBar}
          onSelectEvent={openPin}
          empty={emptyState}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        left={presentationToggle}
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
        empty={emptyState}
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

/**
 * `"2014 – 2020"`, or `"Mar – Sep 2015"` inside one year.
 *
 * Years, not exact dates, even though the window is stored as dates: the chip answers "roughly
 * where am I" at a glance, and a drag lands on an arbitrary day that nobody chose on purpose.
 */
function formatWindow(window: TimelineWindow): string {
  const from = window.startKey.slice(0, 4);
  const to = window.endKey.slice(0, 4);
  if (from !== to) return `${from} – ${to}`;

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const startMonth = months[Number(window.startKey.slice(5, 7)) - 1];
  const endMonth = months[Number(window.endKey.slice(5, 7)) - 1];
  return startMonth === endMonth
    ? `${startMonth} ${from}`
    : `${startMonth} – ${endMonth} ${from}`;
}
